import {
  DemoPassExpired,
  DemoPassIssued,
  EventBridgeEnvelope,
  EventSource,
  PassTenantId,
} from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import { z } from "zod";
import type { TenancyContext } from "./context.js";
import {
  closeRedemption,
  countEvent,
  expireBySchedule,
  provisionTenant,
  reconcile,
  remindHolder,
  teardownTenant,
} from "./lifecycle.js";
import { WorkerTask } from "./model.js";

export class UnprocessableEventError extends Error {
  override readonly name = "UnprocessableEventError";
}

/** SNS delivery (budget alarm topic → kill switch). */
const SnsEvent = z.object({
  Records: z
    .array(
      z.object({
        EventSource: z.literal("aws:sns"),
        Sns: z.object({ Message: z.string(), TopicArn: z.string().optional() }),
      }),
    )
    .min(1),
});

/** Just enough of any portal event to count it for its tenant. */
const CountedDetail = z.object({ tenantId: z.string(), correlationId: z.string().optional() });

function parse<T extends z.ZodType>(schema: T, detail: unknown, name: string): z.infer<T> {
  const parsed = schema.safeParse(detail);
  if (!parsed.success)
    throw new UnprocessableEventError(`Invalid ${name}: ${parsed.error.message}`);
  return parsed.data;
}

/**
 * Worker of the tenancy domain. Invoked by
 * - EventBridge rules: `DemoPassIssued` (provision), `DemoPassExpired` (teardown), and
 *   every other `kundenportal.*` event of a pass tenant (events quota);
 * - EventBridge Scheduler: `{task: "expire", tenantId, passId}` at the end of a pass,
 *   `{task: "remind", tenantId, passId}` `reminderHours` after redeeming,
 *   `{task: "reconcile"}` daily;
 * - SNS: the budget alarm topic, which closes redemption (kill switch).
 * Lambda retries failed invocations; every step is idempotent.
 */
export function createWorker(ctx: TenancyContext) {
  return async (input: unknown): Promise<unknown> => {
    const task = WorkerTask.safeParse(input);
    if (task.success) {
      if (task.data.task === "reconcile") {
        const result = await reconcile(ctx);
        log("info", "Reconcile finished", { ...result });
        return result;
      }
      const { tenantId, passId } = task.data;
      if (task.data.task === "remind") {
        await remindHolder(ctx, tenantId, passId);
        return undefined;
      }
      await expireBySchedule(ctx, tenantId, passId);
      return undefined;
    }

    const sns = SnsEvent.safeParse(input);
    if (sns.success) {
      await closeRedemption(ctx, `Budget alarm: ${sns.data.Records[0]?.Sns.Message ?? ""}`);
      return undefined;
    }

    const envelope = EventBridgeEnvelope.safeParse(input);
    if (!envelope.success)
      throw new UnprocessableEventError("Input is neither task, SNS nor event");
    const { source, "detail-type": detailType, detail } = envelope.data;
    try {
      if (source === DemoPassIssued.source && detailType === DemoPassIssued.detailType) {
        return await provisionTenant(ctx, parse(DemoPassIssued.detail, detail, detailType));
      }
      if (source === DemoPassExpired.source && detailType === DemoPassExpired.detailType) {
        const expired = parse(DemoPassExpired.detail, detail, detailType);
        await teardownTenant(ctx, expired.payload.tenantId, expired.correlationId);
        return undefined;
      }
      // Own lifecycle events do not count against the quota.
      if (source === EventSource.tenancy || !source.startsWith("kundenportal.")) return undefined;
      const counted = CountedDetail.safeParse(detail);
      if (!counted.success || !PassTenantId.safeParse(counted.data.tenantId).success) {
        return undefined;
      }
      await countEvent(ctx, counted.data.tenantId, counted.data.correlationId ?? detailType);
      return undefined;
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
