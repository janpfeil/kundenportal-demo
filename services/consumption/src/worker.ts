import {
  ContractChanged,
  CustomerRegistered,
  EventBridgeEnvelope,
  MigratedAccountsRemoved,
} from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import { z } from "zod";
import type { ConsumptionService } from "./service.js";

/** Input the EventBridge schedule passes to the worker (not a domain event). */
export const SCHEDULED_CHECK = { task: "checkDataVolumes" } as const;
const ScheduledCheck = z.strictObject({ task: z.literal(SCHEDULED_CHECK.task) });

export class UnprocessableEventError extends Error {
  override name = "UnprocessableEventError";
}

function parse<T extends z.ZodType>(schema: T, detail: unknown, name: string): z.infer<T> {
  const parsed = schema.safeParse(detail);
  if (!parsed.success) {
    throw new UnprocessableEventError(`Invalid ${name}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Worker of the consumption domain, invoked asynchronously by EventBridge (rules on the
 * own bus) and by the daily schedule. There is no queue in front of it: Lambda retries a
 * failed invocation twice and then hands it to the dead-letter queue, so the function
 * throws on every failure. Invalid events therefore also end up in the DLQ.
 */
export function createWorker(service: ConsumptionService) {
  return async (input: unknown): Promise<void> => {
    if (ScheduledCheck.safeParse(input).success) {
      const result = await service.checkDataVolumes();
      log("info", "Data volume check done", result);
      if (result.failed > 0) throw new Error(`${result.failed} contract(s) failed; retrying`);
      return;
    }
    const envelope = EventBridgeEnvelope.safeParse(input);
    if (!envelope.success) throw new UnprocessableEventError("Input is not an EventBridge event");
    const { source, "detail-type": detailType, detail } = envelope.data;
    try {
      if (source === CustomerRegistered.source && detailType === CustomerRegistered.detailType) {
        return await service.onCustomerRegistered(
          parse(CustomerRegistered.detail, detail, detailType),
        );
      }
      if (source === ContractChanged.source && detailType === ContractChanged.detailType) {
        return await service.onContractChanged(parse(ContractChanged.detail, detail, detailType));
      }
      if (
        source === MigratedAccountsRemoved.source &&
        detailType === MigratedAccountsRemoved.detailType
      ) {
        return await service.onMigratedAccountsRemoved(
          parse(MigratedAccountsRemoved.detail, detail, detailType),
        );
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
