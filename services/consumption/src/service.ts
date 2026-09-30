import { randomUUID } from "node:crypto";
import {
  type ContractChangedDetail,
  type CustomerRegisteredDetail,
  deterministicUuid,
  type MigratedAccountsRemovedDetail,
} from "@kundenportal/events";
import {
  type Caller,
  HttpError,
  log,
  notFound,
  TenantDirectory,
  type TenantStatusLookup,
} from "@kundenportal/service-kit";
import {
  type ContractProjection,
  type DataUsage,
  demoUsage,
  type MeterReading,
  type NewReading,
  readingId,
  todayInGermany,
} from "./model.js";
import type { ConsumptionEvents } from "./publisher.js";
import type { ConsumptionRepository } from "./repository.js";

export interface Clock {
  now(): Date;
}

const unprocessable = (detail: string) => new HttpError(422, "Unprocessable Content", detail);

/** Use cases of the consumption domain, independent of Lambda, HTTP and EventBridge. */
export class ConsumptionService {
  constructor(
    private readonly repository: ConsumptionRepository,
    private readonly events: ConsumptionEvents,
    private readonly clock: Clock = { now: () => new Date() },
    private readonly newId: () => string = randomUUID,
    private readonly tenants: TenantStatusLookup = new TenantDirectory(),
  ) {}

  async readings(caller: Caller, contractId: string): Promise<MeterReading[]> {
    const contract = await this.ownContract(caller, contractId);
    return this.repository.readings(caller.tenantId, contract.contractId);
  }

  /**
   * Stores a plausible reading and publishes `MeterReadingSubmitted`. Plausible means: the
   * contract has a meter, the date is not in the future (German time) and neither value
   * nor date are below the latest reading.
   */
  async submitReading(
    caller: Caller,
    contractId: string,
    input: NewReading,
    correlationId: string,
  ): Promise<MeterReading> {
    const contract = await this.ownContract(caller, contractId);
    if (!contract.meterNumber || !contract.unit) throw unprocessable("The contract has no meter");
    if (contract.status !== "active") throw unprocessable("The contract is not active");
    const now = this.clock.now();
    if (input.readAt > todayInGermany(now)) throw unprocessable("The date is in the future");
    const [latest] = await this.repository.readings(caller.tenantId, contractId, 1);
    if (latest && input.readAt < latest.readAt) {
      throw unprocessable(`The date is before the latest reading of ${latest.readAt}`);
    }
    if (latest && input.value < latest.value) {
      throw unprocessable(`The value is below the latest reading of ${latest.value}`);
    }

    const submittedAt = now.toISOString();
    const reading: MeterReading = {
      readingId: readingId(submittedAt, this.newId()),
      value: Math.round(input.value * 1000) / 1000,
      unit: contract.unit,
      readAt: input.readAt,
      source: "customer",
      submittedAt,
    };
    await this.repository.addReading(caller.tenantId, contractId, reading);
    await this.events.meterReadingSubmitted({
      eventId: this.newId(),
      tenantId: caller.tenantId,
      occurredAt: submittedAt,
      correlationId,
      payload: {
        customerId: contract.customerId,
        contractId,
        division: contract.division,
        meterNumber: contract.meterNumber,
        readingId: reading.readingId,
        value: reading.value,
        unit: reading.unit,
        readAt: reading.readAt,
      },
    });
    log("info", "Meter reading submitted", { tenantId: caller.tenantId, contractId });
    return reading;
  }

  async usage(caller: Caller, contractId: string): Promise<DataUsage> {
    const contract = await this.ownContract(caller, contractId);
    if (!contract.dataVolumeMb) throw unprocessable("The contract has no data volume");
    return demoUsage(contractId, contract.dataVolumeMb, this.clock.now());
  }

  /**
   * `MigratedAccountsRemoved` (demo reset): deletes readings, usage, projection and watch
   * list entry of every contract of the removed customers, then the identity links. A
   * migrated contract keeps its id when the person is migrated again, so leftovers would
   * otherwise block the new projection (older version) and show old readings.
   */
  async onMigratedAccountsRemoved(event: MigratedAccountsRemovedDetail): Promise<void> {
    const { tenantId, payload } = event;
    const contractIds = await this.repository.contractsOf(
      tenantId,
      payload.accounts.map((a) => a.customerId),
    );
    for (const contractId of contractIds) {
      await this.repository.removeContract(tenantId, contractId);
    }
    for (const { subject } of payload.accounts) {
      await this.repository.unlinkSubject(tenantId, subject);
    }
    log("info", "Consumption of removed customers deleted", {
      tenantId,
      customers: payload.accounts.length,
      contracts: contractIds.length,
    });
  }

  async onCustomerRegistered(event: CustomerRegisteredDetail): Promise<void> {
    await this.repository.linkSubject(
      event.tenantId,
      event.payload.subject,
      event.payload.customerId,
    );
  }

  /**
   * `ContractChanged`: keeps the own projection (owner, meter, data volume) and the list of
   * mobile contracts for the daily check; a new metered contract brings its start reading
   * as the first entry of the history.
   */
  async onContractChanged(event: ContractChangedDetail): Promise<void> {
    const { tenantId, payload } = event;
    const snapshot = payload.contract;
    const projection: ContractProjection = {
      contractId: snapshot.contractId,
      customerId: snapshot.customerId,
      division: snapshot.division,
      status: snapshot.status,
      version: snapshot.version,
    };
    if (snapshot.meterNumber) projection.meterNumber = snapshot.meterNumber;
    if (snapshot.unit) projection.unit = snapshot.unit;
    if (snapshot.dataVolumeMb) projection.dataVolumeMb = snapshot.dataVolumeMb;

    if (await this.repository.saveContract(tenantId, projection)) {
      if (projection.dataVolumeMb && projection.status === "active") {
        await this.repository.watch({
          tenantId,
          contractId: projection.contractId,
          customerId: projection.customerId,
          dataVolumeMb: projection.dataVolumeMb,
        });
      } else if (snapshot.division === "mobile") {
        await this.repository.unwatch(tenantId, projection.contractId);
      }
    }

    if (payload.changeType === "created" && snapshot.startReading && snapshot.unit) {
      const at = `${snapshot.startReading.readAt}T00:00:00.000Z`;
      await this.repository.addReading(tenantId, snapshot.contractId, {
        readingId: readingId(at, deterministicUuid(snapshot.contractId, "start")),
        value: snapshot.startReading.value,
        unit: snapshot.unit,
        readAt: snapshot.startReading.readAt,
        source: "contract-start",
        submittedAt: at,
      });
    }
  }

  /**
   * Daily check (EventBridge Scheduler): publishes `DataVolumeThresholdReached` once per
   * contract and month when the demo usage reaches 80 %. The event id derives from
   * contract and month, and the marker is written only after publishing, so a failed or
   * repeated run neither loses nor duplicates a warning.
   *
   * The watch list is a platform item in the base table; each contract is read through
   * the data of its own tenant. Contracts of a pass that is not active are skipped, those
   * of a deleted tenant leave the list.
   */
  async checkDataVolumes(): Promise<{ checked: number; notified: number; failed: number }> {
    const now = this.clock.now();
    const at = now.toISOString();
    let checked = 0;
    let notified = 0;
    let failed = 0;
    for await (const watched of this.repository.watched()) {
      checked += 1;
      try {
        const status = await this.tenants.status(watched.tenantId);
        if (status !== "active") {
          if (status === undefined || status === "deleted") {
            await this.repository.unwatch(watched.tenantId, watched.contractId);
          }
          continue;
        }
        const usage = demoUsage(watched.contractId, watched.dataVolumeMb, now);
        if (usage.usedPercent < usage.thresholdPercent) continue;
        const { tenantId, contractId } = watched;
        if (await this.repository.thresholdNotified(tenantId, contractId, usage.month)) continue;
        await this.events.dataVolumeThresholdReached({
          eventId: deterministicUuid(tenantId, contractId, usage.month, "data-volume"),
          tenantId,
          occurredAt: at,
          correlationId: `data-volume-check-${at.slice(0, 10)}`,
          payload: {
            customerId: watched.customerId,
            contractId,
            month: usage.month,
            usedMb: usage.usedMb,
            includedMb: usage.includedMb,
            thresholdPercent: usage.thresholdPercent,
          },
        });
        await this.repository.markThresholdNotified(
          tenantId,
          contractId,
          usage.month,
          usage.usedMb,
          at,
        );
        notified += 1;
      } catch (error) {
        failed += 1;
        log("error", "Data volume check failed for a contract", {
          contractId: watched.contractId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { checked, notified, failed };
  }

  /**
   * The contract must belong to the caller: both projections (identity → customer and
   * contract → customer) are the consumption domain's own, filled from events.
   */
  private async ownContract(caller: Caller, contractId: string): Promise<ContractProjection> {
    const [customerId, contract] = await Promise.all([
      this.repository.customerOf(caller.tenantId, caller.subject),
      this.repository.contract(caller.tenantId, contractId),
    ]);
    if (!customerId || !contract || contract.customerId !== customerId) {
      throw notFound("Contract not found");
    }
    return contract;
  }
}
