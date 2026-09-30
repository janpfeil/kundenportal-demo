import {
  AccountsLinked,
  EventBridgeEnvelope,
  LegacyAccountMigrated,
  MigratedAccountsRemoved,
} from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import type { CustomerService } from "./service.js";

/** The event can never succeed (invalid or unknown); it goes to the DLQ without retries helping. */
export class UnprocessableEventError extends Error {
  override readonly name = "UnprocessableEventError";
}

/**
 * Worker of the customer domain, invoked asynchronously by EventBridge rules on the own
 * bus: `LegacyAccountMigrated` (create the migrated customer), `AccountsLinked` and
 * `MigratedAccountsRemoved` (delete the customers of removed accounts).
 * Like the other workers without a queue: two Lambda retries, then the DLQ; every
 * failure throws, the service is idempotent.
 */
export function createWorker(service: CustomerService) {
  return async (input: unknown): Promise<void> => {
    const envelope = EventBridgeEnvelope.safeParse(input);
    if (!envelope.success) throw new UnprocessableEventError("Input is not an EventBridge event");
    const { source, "detail-type": detailType, detail } = envelope.data;
    try {
      if (
        (LegacyAccountMigrated.sources as readonly string[]).includes(source) &&
        detailType === LegacyAccountMigrated.detailType
      ) {
        const parsed = LegacyAccountMigrated.detail.safeParse(detail);
        if (!parsed.success) throw new UnprocessableEventError(`Invalid ${detailType}`);
        return await service.onLegacyAccountMigrated(parsed.data);
      }
      if (source === AccountsLinked.source && detailType === AccountsLinked.detailType) {
        const parsed = AccountsLinked.detail.safeParse(detail);
        if (!parsed.success) throw new UnprocessableEventError(`Invalid ${detailType}`);
        return await service.onAccountsLinked(parsed.data);
      }
      if (
        source === MigratedAccountsRemoved.source &&
        detailType === MigratedAccountsRemoved.detailType
      ) {
        const parsed = MigratedAccountsRemoved.detail.safeParse(detail);
        if (!parsed.success) throw new UnprocessableEventError(`Invalid ${detailType}`);
        return await service.onMigratedAccountsRemoved(parsed.data);
      }
      throw new UnprocessableEventError(`No handler for ${source}/${detailType}`);
    } catch (error) {
      log(error instanceof UnprocessableEventError ? "warn" : "error", "Event failed", {
        source,
        detailType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
