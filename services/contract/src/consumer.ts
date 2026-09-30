import {
  CustomerRegistered,
  EventBridgeEnvelope,
  MeterReadingSubmitted,
} from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import type { z } from "zod";
import { type ContractService, UnprocessableEventError } from "./service.js";

function parse<T extends z.ZodType>(schema: T, detail: unknown, name: string): z.infer<T> {
  const parsed = schema.safeParse(detail);
  if (!parsed.success)
    throw new UnprocessableEventError(`Invalid ${name}: ${parsed.error.message}`);
  return parsed.data;
}

/**
 * SQS consumer of the contract domain (rule → queue with DLQ → this function):
 * `CustomerRegistered` (projection, demo contracts) and `MeterReadingSubmitted`
 * (recalculate the installment).
 */
export function createConsumer(service: ContractService) {
  async function handle(record: SQSRecord): Promise<void> {
    let body: unknown;
    try {
      body = JSON.parse(record.body);
    } catch {
      throw new UnprocessableEventError("Message body is not JSON");
    }
    const envelope = EventBridgeEnvelope.safeParse(body);
    if (!envelope.success) throw new UnprocessableEventError("Message is not an EventBridge event");
    const { source, "detail-type": detailType, detail } = envelope.data;
    if (source === CustomerRegistered.source && detailType === CustomerRegistered.detailType) {
      return service.onCustomerRegistered(parse(CustomerRegistered.detail, detail, detailType));
    }
    if (
      source === MeterReadingSubmitted.source &&
      detailType === MeterReadingSubmitted.detailType
    ) {
      return service.onMeterReadingSubmitted(
        parse(MeterReadingSubmitted.detail, detail, detailType),
      );
    }
    throw new UnprocessableEventError(`No handler for ${source}/${detailType}`);
  }

  /**
   * Processes each message independently and reports failed ones back to SQS (partial
   * batch response); they are retried and land in the DLQ after `maxReceiveCount`.
   */
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const failures: SQSBatchResponse["batchItemFailures"] = [];
    for (const record of event.Records) {
      try {
        await handle(record);
      } catch (error) {
        log(error instanceof UnprocessableEventError ? "warn" : "error", "Message failed", {
          messageId: record.messageId,
          receiveCount: record.attributes.ApproximateReceiveCount,
          error: error instanceof Error ? error.message : String(error),
        });
        failures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures: failures };
  };
}
