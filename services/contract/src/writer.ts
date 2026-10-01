import { type ContractInitiator, deterministicUuid } from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import type { Clock } from "./clock.js";
import { type ContractRecord, productIdOf, productVersionOf, toSnapshot } from "./contract.js";
import { today } from "./dates.js";
import { changedFields, historyEntry } from "./history.js";
import type { PriceVersion } from "./products.js";
import type { ContractEvents } from "./publisher.js";
import type { ContractRepository } from "./repository.js";

/**
 * Saves contract changes the same way for customers and the operator: one transaction
 * with the contract (optimistic locking on `version`), its directory entry and a history
 * entry, then `ContractChanged` with what changed, who initiated it and why.
 */
export class ContractWriter {
  constructor(
    private readonly repository: ContractRepository,
    private readonly events: ContractEvents,
    private readonly clock: Clock,
  ) {}

  /**
   * Returns the saved contract, `current` itself if nothing changed, or `undefined` if
   * someone changed the contract since it was read.
   */
  async change(
    tenantId: string,
    current: ContractRecord,
    next: ContractRecord,
    context: {
      by: ContractInitiator;
      correlationId: string;
      reason?: string | undefined;
      versions?: { before?: PriceVersion; after?: PriceVersion };
    },
  ): Promise<ContractRecord | undefined> {
    const changes = changedFields(current, next);
    if (changes.length === 0) return current;
    const now = this.clock.now();
    const saved: ContractRecord = {
      ...next,
      version: current.version + 1,
      updatedAt: now.toISOString(),
      listed: true,
    };
    const history = historyEntry({
      current,
      next: saved,
      changes,
      by: context.by,
      reason: context.reason,
      ...(context.versions ? { versions: context.versions } : {}),
    });
    const stored = await this.repository.save(tenantId, saved, {
      expectedVersion: current.version,
      history,
    });
    if (!stored) return undefined;
    await this.events.contractChanged({
      eventId: deterministicUuid(saved.contractId, String(saved.version)),
      tenantId,
      occurredAt: saved.updatedAt,
      correlationId: context.correlationId,
      payload: {
        changeType: "updated",
        changes,
        previous: {
          monthlyInstallmentCent: current.monthlyInstallmentCent,
          tariffOption: current.tariffOption,
          tariffName: current.tariffName,
          productId: productIdOf(current),
          productVersion: productVersionOf(current),
        },
        contract: toSnapshot(saved, today(now)),
        initiatedBy: context.by,
        ...(context.reason ? { reason: context.reason } : {}),
      },
    });
    log("info", "Contract changed", {
      tenantId,
      contractId: saved.contractId,
      changes,
      by: context.by,
    });
    return saved;
  }

  /**
   * Creates contracts (with their directory entries) and publishes `ContractChanged`
   * (`created`). An existing contract is not written again, but its event is published
   * again with the same id (redelivery), which consumers deduplicate.
   */
  async create(
    tenantId: string,
    records: { record: ContractRecord; eventId: string }[],
    context: { by: ContractInitiator; correlationId: string; occurredAt: string },
  ): Promise<void> {
    for (const { record } of records) {
      await this.repository.save(tenantId, { ...record, listed: true });
    }
    const day = today(this.clock.now());
    await this.events.contractChanged(
      ...records.map(({ record, eventId }) => ({
        eventId,
        tenantId,
        occurredAt: context.occurredAt,
        correlationId: context.correlationId,
        payload: {
          changeType: "created" as const,
          changes: [],
          contract: toSnapshot(record, day),
          initiatedBy: context.by,
        },
      })),
    );
  }
}
