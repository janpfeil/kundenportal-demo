import { createHash } from "node:crypto";
import { z } from "zod";

/** The part of an EventBridge event consumers need; SQS delivers it as message body. */
export const EventBridgeEnvelope = z.object({
  source: z.string(),
  "detail-type": z.string(),
  detail: z.unknown(),
});
export type EventBridgeEnvelope = z.infer<typeof EventBridgeEnvelope>;

/**
 * A UUID (version 8, RFC 9562) derived from a seed. Consumers use it for ids of what
 * they create from an event (items, follow-up events), so a redelivered event yields
 * the same ids and every step stays idempotent.
 */
export function deterministicUuid(...seed: string[]): string {
  const hex = createHash("sha256").update(seed.join("\u0000")).digest("hex");
  const variant = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
