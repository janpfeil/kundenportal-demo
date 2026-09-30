import { CustomerRegistered, EventBridgeEnvelope } from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import { z } from "zod";
import type { DocumentService } from "./service.js";

/** Detail of the S3 "Object Created" event on the default bus (bucket with EventBridge enabled). */
const ObjectCreatedDetail = z.object({
  bucket: z.object({ name: z.string().min(1) }),
  object: z.object({ key: z.string().min(1), size: z.number().int().nonnegative() }),
});

export class UnprocessableEventError extends Error {
  override name = "UnprocessableEventError";
}

/**
 * Worker of the documents domain, invoked asynchronously by EventBridge: S3 uploads
 * (default bus) and `CustomerRegistered` (own bus). Lambda retries a failed invocation
 * twice and then hands it to the dead-letter queue, so every failure throws.
 */
export function createWorker(service: DocumentService) {
  return async (input: unknown): Promise<void> => {
    const envelope = EventBridgeEnvelope.extend({ id: z.string().optional() }).safeParse(input);
    if (!envelope.success) throw new UnprocessableEventError("Input is not an EventBridge event");
    const { source, "detail-type": detailType, detail, id } = envelope.data;
    try {
      if (source === "aws.s3" && detailType === "Object Created") {
        const parsed = ObjectCreatedDetail.safeParse(detail);
        if (!parsed.success) throw new UnprocessableEventError("Invalid S3 event");
        const { bucket, object } = parsed.data;
        return await service.onObjectCreated(
          { bucket: bucket.name, key: object.key, size: object.size },
          id ?? "s3",
        );
      }
      if (source === CustomerRegistered.source && detailType === CustomerRegistered.detailType) {
        const parsed = CustomerRegistered.detail.safeParse(detail);
        if (!parsed.success) throw new UnprocessableEventError("Invalid CustomerRegistered");
        return await service.onCustomerRegistered(parsed.data);
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
