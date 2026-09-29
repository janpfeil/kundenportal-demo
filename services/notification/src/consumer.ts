import { CustomerRegistered } from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import { z } from "zod";
import { type Mailbox, notificationId } from "./mailbox.js";
import type { OwnerHints } from "./owner-hints.js";
import { welcomeText } from "./texts.js";

/** The part of an EventBridge event that SQS delivers as message body. */
const EventBridgeEnvelope = z.object({
  source: z.string(),
  "detail-type": z.string(),
  detail: z.unknown(),
});

export class UnprocessableEventError extends Error {
  override name = "UnprocessableEventError";
}

export function createConsumer(mailbox: Mailbox, ownerHints: OwnerHints) {
  async function customerRegistered(detail: unknown): Promise<void> {
    const parsed = CustomerRegistered.detail.safeParse(detail);
    if (!parsed.success)
      throw new UnprocessableEventError(`Invalid CustomerRegistered: ${parsed.error.message}`);
    const { tenantId, eventId, occurredAt, payload } = parsed.data;

    await mailbox.linkSubject(tenantId, payload.subject, payload.customerId);
    const created = await mailbox.add(tenantId, payload.customerId, {
      notificationId: notificationId(occurredAt, eventId),
      kind: "welcome",
      ...welcomeText[payload.locale](payload.displayName),
      createdAt: occurredAt,
      read: false,
    });
    if (created) {
      await ownerHints.send(
        "Kundenportal: neue Registrierung",
        `Mandant ${tenantId}: Kunde ${payload.customerId} hat sich registriert (${occurredAt}).`,
      );
    }
  }

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
      return customerRegistered(detail);
    }
    throw new UnprocessableEventError(`No handler for ${source}/${detailType}`);
  }

  /**
   * Processes each message independently and reports failed ones back to SQS
   * (partial batch response). Failed messages are retried and end up in the DLQ
   * after the queue's maxReceiveCount.
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
