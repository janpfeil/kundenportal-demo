import {
  type CustomerRegisteredDetail,
  deterministicUuid,
  type InstallmentAdjustedDetail,
  type MeterReadingSubmittedDetail,
} from "@kundenportal/events";
import { type Caller, HttpError, log, notFound } from "@kundenportal/service-kit";
import {
  type ContractRecord,
  type ContractUpdate,
  type ContractView,
  demoContracts,
  isMetered,
  toSnapshot,
  toView,
} from "./contract.js";
import type { ContractEvents } from "./publisher.js";
import type { ContractRepository } from "./repository.js";
import { estimateAnnualConsumption, recommendedInstallment, tariffOption } from "./tariffs.js";

export interface Clock {
  now(): Date;
}

const unprocessable = (detail: string) => new HttpError(422, "Unprocessable Content", detail);
const euros = (cents: number) => (cents / 100).toFixed(2);

/** An event the consumer cannot process however often it retries (goes to the DLQ). */
export class UnprocessableEventError extends Error {
  override name = "UnprocessableEventError";
}

/** Use cases of the contract domain, independent of Lambda, HTTP and SQS. */
export class ContractService {
  constructor(
    private readonly repository: ContractRepository,
    private readonly events: ContractEvents,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async list(caller: Caller): Promise<ContractView[]> {
    const customerId = await this.repository.customerOf(caller.tenantId, caller.subject);
    if (!customerId) return [];
    return (await this.repository.list(caller.tenantId, customerId)).map(toView);
  }

  async get(caller: Caller, contractId: string): Promise<ContractView> {
    return toView(await this.load(caller, contractId));
  }

  /**
   * Changes the tariff option and/or the monthly installment. The installment of a
   * metered contract may be set in whole euros within the allowed range; a new tariff
   * option moves that range and keeps the installment inside it. Telco contracts have a
   * fixed monthly price that follows the option.
   */
  async update(
    caller: Caller,
    contractId: string,
    update: ContractUpdate,
    correlationId: string,
  ): Promise<ContractView> {
    const current = await this.load(caller, contractId);
    const next: ContractRecord = { ...current };
    const metered = isMetered(current.division);

    if (update.tariffOption !== undefined && update.tariffOption !== current.tariffOption) {
      const option = tariffOption(current.division, update.tariffOption);
      if (!option) throw unprocessable(`Unknown tariff option ${update.tariffOption}`);
      next.tariffOption = option.id;
      if (metered) {
        const range = recommendedInstallment(current.estimatedAnnualConsumption ?? 0, option);
        next.installmentMinCent = range.minCent;
        next.installmentMaxCent = range.maxCent;
        next.monthlyInstallmentCent = Math.min(
          Math.max(current.monthlyInstallmentCent, range.minCent),
          range.maxCent,
        );
      } else {
        next.monthlyInstallmentCent = option.monthlyPriceCent;
        if (option.dataVolumeMb) next.dataVolumeMb = option.dataVolumeMb;
      }
    }

    if (update.monthlyInstallmentCent !== undefined) {
      if (!metered) throw unprocessable("The monthly price of this contract is fixed");
      const amount = update.monthlyInstallmentCent;
      const min = next.installmentMinCent ?? 0;
      const max = next.installmentMaxCent ?? Number.MAX_SAFE_INTEGER;
      if (amount % 100 !== 0) throw unprocessable("The installment must be whole euros");
      if (amount < min || amount > max) {
        throw unprocessable(`The installment must be between ${euros(min)} and ${euros(max)} EUR`);
      }
      next.monthlyInstallmentCent = amount;
    }

    const changes = [
      ...(next.monthlyInstallmentCent !== current.monthlyInstallmentCent
        ? (["installment"] as const)
        : []),
      ...(next.tariffOption !== current.tariffOption ? (["tariffOption"] as const) : []),
    ];
    if (changes.length === 0) return toView(current);

    const now = this.clock.now().toISOString();
    next.version = current.version + 1;
    next.updatedAt = now;
    if (!(await this.repository.replace(caller.tenantId, next, current.version))) {
      throw new HttpError(409, "Conflict", "The contract was changed concurrently; reload it");
    }
    await this.events.contractChanged({
      eventId: deterministicUuid(next.contractId, String(next.version)),
      tenantId: caller.tenantId,
      occurredAt: now,
      correlationId,
      payload: {
        changeType: "updated",
        changes,
        previous: {
          monthlyInstallmentCent: current.monthlyInstallmentCent,
          tariffOption: current.tariffOption,
        },
        contract: toSnapshot(next),
      },
    });
    log("info", "Contract changed", { tenantId: caller.tenantId, contractId, changes });
    return toView(next);
  }

  /**
   * `CustomerRegistered`: remembers whose contracts a sign-in identity opens and gives a
   * newly registered customer demo contracts. Redelivery creates nothing twice and
   * re-publishes the same events (same ids), which consumers deduplicate.
   */
  async onCustomerRegistered(event: CustomerRegisteredDetail): Promise<void> {
    const { tenantId, eventId, occurredAt, correlationId, payload } = event;
    await this.repository.linkSubject(tenantId, payload.subject, payload.customerId);
    if (payload.origin !== "registration") {
      // Contracts of legacy customers arrive with their migration (phase 3).
      return;
    }
    const records = demoContracts(payload.customerId, eventId, occurredAt);
    for (const record of records) await this.repository.create(tenantId, record);
    await this.events.contractChanged(
      ...records.map((record) => ({
        eventId: deterministicUuid(eventId, record.division, "created"),
        tenantId,
        occurredAt,
        correlationId,
        payload: { changeType: "created" as const, changes: [], contract: toSnapshot(record) },
      })),
    );
    log("info", "Demo contracts ready", { tenantId, customerId: payload.customerId });
  }

  /**
   * `MeterReadingSubmitted`: extrapolates the annual consumption from the contract's start
   * reading and the new reading (at least 30 days apart) and sets the recommended
   * installment; publishes `InstallmentAdjusted` if the amount changed.
   */
  async onMeterReadingSubmitted(event: MeterReadingSubmittedDetail): Promise<void> {
    const { tenantId, eventId, correlationId, payload } = event;
    const record = await this.repository.get(
      tenantId,
      payload.customerId,
      payload.division,
      payload.contractId,
    );
    if (!record) throw new UnprocessableEventError(`Unknown contract ${payload.contractId}`);
    if (!record.startReading || !isMetered(record.division)) {
      log("warn", "Reading for a contract without meter reference ignored", { eventId });
      return;
    }
    if (record.lastReading?.eventId === eventId) {
      // Redelivery after the contract was already updated: publish what was decided then.
      if (record.lastAdjustment?.payload.causationId === eventId) {
        await this.events.installmentAdjusted(record.lastAdjustment);
      }
      return;
    }
    if (record.lastReading && payload.readAt < record.lastReading.readAt) {
      log("info", "Older reading does not change the installment", { eventId });
      return;
    }

    const now = this.clock.now().toISOString();
    const next: ContractRecord = {
      ...record,
      lastReading: { value: payload.value, readAt: payload.readAt, eventId },
      version: record.version + 1,
      updatedAt: now,
    };
    let adjustment: InstallmentAdjustedDetail | undefined;
    const annual = estimateAnnualConsumption(record.startReading, payload);
    const option = tariffOption(record.division, record.tariffOption);
    if (annual !== undefined && option && record.unit) {
      const recommended = recommendedInstallment(annual, option);
      next.estimatedAnnualConsumption = annual;
      next.installmentMinCent = recommended.minCent;
      next.installmentMaxCent = recommended.maxCent;
      if (recommended.installmentCent !== record.monthlyInstallmentCent) {
        next.monthlyInstallmentCent = recommended.installmentCent;
        adjustment = {
          eventId: deterministicUuid(eventId, "installment"),
          tenantId,
          occurredAt: now,
          correlationId,
          payload: {
            customerId: record.customerId,
            contractId: record.contractId,
            division: record.division,
            previousInstallmentCent: record.monthlyInstallmentCent,
            newInstallmentCent: recommended.installmentCent,
            estimatedAnnualConsumption: annual,
            unit: record.unit,
            reason: "meter-reading",
            causationId: eventId,
          },
        };
        next.lastAdjustment = adjustment;
      }
    }
    if (!(await this.repository.replace(tenantId, next, record.version))) {
      throw new Error(`Contract ${record.contractId} changed concurrently; retrying`);
    }
    if (adjustment) await this.events.installmentAdjusted(adjustment);
  }

  private async load(caller: Caller, contractId: string): Promise<ContractRecord> {
    const customerId = await this.repository.customerOf(caller.tenantId, caller.subject);
    const record = customerId
      ? await this.repository.find(caller.tenantId, customerId, contractId)
      : undefined;
    if (!record) throw notFound("Contract not found");
    return record;
  }
}
