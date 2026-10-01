import {
  type AccountsLinkedDetail,
  type CustomerRegisteredDetail,
  deterministicUuid,
  type InstallmentAdjustedDetail,
  type LegacyAccountMigratedDetail,
  type LegacyContract,
  type MeterReadingSubmittedDetail,
  type MigratedAccountsRemovedDetail,
} from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import type { ProductCatalogue } from "./catalogue.js";
import { type Clock, systemClock } from "./clock.js";
import { type ContractRecord, isMetered, optionOf } from "./contract.js";
import { euros } from "./history.js";
import { demoContracts, legacyContracts } from "./origins.js";
import type { ContractEvents } from "./publisher.js";
import { type ContractRepository, isTestAccount } from "./repository.js";
import { estimateAnnualConsumption, recommendedInstallment } from "./tariffs.js";
import { ContractWriter } from "./writer.js";

/** An event the worker cannot process however often it retries (goes to the DLQ). */
export class UnprocessableEventError extends Error {
  override name = "UnprocessableEventError";
}

type Metadata = { tenantId: string; eventId: string; occurredAt: string; correlationId: string };

/**
 * The contract domain's reactions to other domains' events (worker): identity links,
 * demo and legacy contracts, installment recalculation, removal of reset accounts.
 */
export class ContractIntake {
  private readonly writer: ContractWriter;

  constructor(
    private readonly repository: ContractRepository,
    private readonly events: ContractEvents,
    private readonly catalogue: ProductCatalogue,
    private readonly clock: Clock = systemClock,
  ) {
    this.writer = new ContractWriter(repository, events, clock);
  }

  /**
   * `CustomerRegistered`: remembers whose contracts a sign-in identity opens and gives a
   * newly registered customer demo contracts. Redelivery creates nothing twice and
   * re-publishes the same events (same ids), which consumers deduplicate.
   */
  async onCustomerRegistered(event: CustomerRegisteredDetail): Promise<void> {
    const { tenantId, eventId, occurredAt, payload } = event;
    const { subject, customerId, displayName } = payload;
    const testAccount = isTestAccount(payload.email);
    await this.repository.linkSubject(tenantId, subject, customerId, displayName, testAccount);
    if (payload.origin !== "registration") {
      // Contracts of legacy customers arrive with their migration (phase 3).
      return;
    }
    const records = demoContracts(customerId, eventId, occurredAt, displayName).map((record) =>
      testAccount ? { ...record, testAccount: true } : record,
    );
    await this.writer.create(
      tenantId,
      records.map((record) => ({
        record,
        eventId: deterministicUuid(eventId, record.division, "created"),
      })),
      { by: "system", correlationId: event.correlationId, occurredAt },
    );
    log("info", "Demo contracts ready", { tenantId, customerId });
  }

  /**
   * `LegacyAccountMigrated`: takes over the contracts the customer had in the legacy
   * system (phase 3). Redelivery creates nothing twice and re-publishes the same events.
   */
  async onLegacyAccountMigrated(event: LegacyAccountMigratedDetail): Promise<void> {
    const { tenantId, payload } = event;
    await this.repository.linkSubject(
      tenantId,
      payload.subject,
      payload.customerId,
      payload.displayName,
    );
    await this.takeOver(event, payload.customerId, payload.contracts, payload.displayName);
  }

  /** `AccountsLinked`: the linked account's contracts move to the confirming customer. */
  async onAccountsLinked(event: AccountsLinkedDetail): Promise<void> {
    const link = await this.repository.customerOf(event.tenantId, event.payload.subject);
    await this.takeOver(
      event,
      event.payload.customerId,
      event.payload.contracts,
      link?.customerName,
    );
  }

  /**
   * `MigratedAccountsRemoved` (demo reset): deletes the contracts of each removed
   * customer with their history and directory entries, and the identity link. No
   * `ContractChanged` follows: every domain reacts to the removal itself.
   */
  async onMigratedAccountsRemoved(event: MigratedAccountsRemovedDetail): Promise<void> {
    const { tenantId, payload } = event;
    let contracts = 0;
    for (const { subject, customerId } of payload.accounts) {
      contracts += await this.repository.removeCustomer(tenantId, subject, customerId);
    }
    log("info", "Contracts of removed customers deleted", {
      tenantId,
      customers: payload.accounts.length,
      contracts,
    });
  }

  private async takeOver(
    event: Metadata,
    customerId: string,
    contracts: LegacyContract[],
    customerName: string | undefined,
  ): Promise<void> {
    const { tenantId, occurredAt, correlationId } = event;
    const records = legacyContracts(tenantId, customerId, contracts, occurredAt, customerName);
    if (records.length === 0) return;
    await this.writer.create(
      tenantId,
      records.map((record) => ({
        record,
        eventId: deterministicUuid(record.contractId, "created"),
      })),
      { by: "system", correlationId, occurredAt },
    );
    log("info", "Legacy contracts taken over", { tenantId, customerId, count: records.length });
  }

  /**
   * `MeterReadingSubmitted`: extrapolates the annual consumption from the contract's start
   * reading and the new reading (at least 30 days apart) and sets the recommended
   * installment for the contract's price version; publishes `InstallmentAdjusted` (and
   * keeps a history entry) if the amount changed.
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
    const version = await this.catalogue.versionFor(tenantId, record);
    const option = optionOf(version, record.tariffOption);
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
    const history = adjustment && {
      at: now,
      change: "installment" as const,
      by: "system" as const,
      summary: `Abschlag ${euros(record.monthlyInstallmentCent)} → ${euros(next.monthlyInstallmentCent)} nach Zählerstand`,
    };
    const saved = await this.repository.save(tenantId, next, {
      expectedVersion: record.version,
      ...(history ? { history } : {}),
    });
    if (!saved) throw new Error(`Contract ${record.contractId} changed concurrently; retrying`);
    if (adjustment) await this.events.installmentAdjusted(adjustment);
  }
}
