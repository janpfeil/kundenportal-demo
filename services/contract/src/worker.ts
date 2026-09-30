import {
  AccountsLinked,
  CustomerRegistered,
  EventBridgeEnvelope,
  LegacyAccountMigrated,
  MeterReadingSubmitted,
} from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import type { z } from "zod";
import { type ContractService, UnprocessableEventError } from "./service.js";

function parse<T extends z.ZodType>(schema: T, detail: unknown, name: string): z.infer<T> {
  const parsed = schema.safeParse(detail);
  if (!parsed.success) {
    throw new UnprocessableEventError(`Invalid ${name}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Worker of the contract domain, invoked asynchronously by EventBridge rules on the own
 * bus: `CustomerRegistered` (projection, demo contracts), `MeterReadingSubmitted`
 * (recalculate the installment), `LegacyAccountMigrated` and `AccountsLinked` (take over
 * legacy contracts). There is no queue in front of it (an SQS event source
 * polls around the clock and would leave the free tier): Lambda retries a failed
 * invocation twice and then hands it to the dead-letter queue, so every failure throws.
 * Invalid events therefore also end up in the DLQ. The service is idempotent, so retries
 * and duplicate deliveries are harmless.
 */
export function createWorker(service: ContractService) {
  return async (input: unknown): Promise<void> => {
    const envelope = EventBridgeEnvelope.safeParse(input);
    if (!envelope.success) throw new UnprocessableEventError("Input is not an EventBridge event");
    const { source, "detail-type": detailType, detail } = envelope.data;
    try {
      if (source === CustomerRegistered.source && detailType === CustomerRegistered.detailType) {
        return await service.onCustomerRegistered(
          parse(CustomerRegistered.detail, detail, detailType),
        );
      }
      if (
        source === MeterReadingSubmitted.source &&
        detailType === MeterReadingSubmitted.detailType
      ) {
        return await service.onMeterReadingSubmitted(
          parse(MeterReadingSubmitted.detail, detail, detailType),
        );
      }
      if (
        (LegacyAccountMigrated.sources as readonly string[]).includes(source) &&
        detailType === LegacyAccountMigrated.detailType
      ) {
        return await service.onLegacyAccountMigrated(
          parse(LegacyAccountMigrated.detail, detail, detailType),
        );
      }
      if (source === AccountsLinked.source && detailType === AccountsLinked.detailType) {
        return await service.onAccountsLinked(parse(AccountsLinked.detail, detail, detailType));
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
