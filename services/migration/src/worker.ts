import {
  BulkMigrationStarted,
  EventBridgeEnvelope,
  LegacyAccountMigrated,
} from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import type { BulkImport } from "./bulk.js";
import type { Cockpit } from "./cockpit.js";
import type { Linking } from "./links.js";
import { RecordTask } from "./model.js";

export class UnprocessableEventError extends Error {
  override readonly name = "UnprocessableEventError";
}

/**
 * Worker of the migration domain. One EventBridge rule delivers every event of the own
 * bus: each becomes a timeline entry; `BulkMigrationStarted` starts reading the export,
 * `LegacyAccountMigrated` updates the record and looks for duplicates. Two Lambda
 * retries, then the worker DLQ; everything is idempotent.
 */
export function createWorker(bulk: BulkImport, linking: Linking, cockpit: Cockpit) {
  return async (input: unknown): Promise<void> => {
    const envelope = EventBridgeEnvelope.safeParse(input);
    if (!envelope.success) throw new UnprocessableEventError("Input is not an EventBridge event");
    const { source, "detail-type": detailType, detail } = envelope.data;
    try {
      await cockpit.record(envelope.data);
      if (
        source === BulkMigrationStarted.source &&
        detailType === BulkMigrationStarted.detailType
      ) {
        const parsed = BulkMigrationStarted.detail.safeParse(detail);
        if (!parsed.success) throw new UnprocessableEventError(`Invalid ${detailType}`);
        return await bulk.onStarted(parsed.data);
      }
      if (
        (LegacyAccountMigrated.sources as readonly string[]).includes(source) &&
        detailType === LegacyAccountMigrated.detailType
      ) {
        const parsed = LegacyAccountMigrated.detail.safeParse(detail);
        if (!parsed.success) throw new UnprocessableEventError(`Invalid ${detailType}`);
        return await linking.onMigrated(parsed.data);
      }
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

/** Processor entry: one record task per asynchronous invocation (failures → migration DLQ). */
export function createProcessor(bulk: BulkImport) {
  return async (input: unknown): Promise<void> => {
    const task = RecordTask.safeParse(input);
    if (!task.success) throw new UnprocessableEventError("Input is not a record task");
    try {
      await bulk.process(task.data);
    } catch (error) {
      log("warn", "Record task failed; it goes to the migration DLQ", {
        account: `${task.data.account.system}:${task.data.account.customerNumber}`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
