import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { deterministicUuid } from "@kundenportal/events";
import {
  isPassTenant,
  log,
  OWNER_TENANT,
  platformTenantKey,
  quotaExhausted,
  quotaKey,
  type TenantData,
  type TenantDataSource,
} from "@kundenportal/service-kit";
import type { DocumentEvents } from "./publisher.js";

/** Upload URLs a demo pass may request unless `QUOTA_UPLOADS` says otherwise (§5). */
export const DEFAULT_UPLOAD_LIMIT = 20;

export function uploadLimitFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.QUOTA_UPLOADS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_UPLOAD_LIMIT;
}

const isConditionFailure = (error: unknown) => error instanceof ConditionalCheckFailedException;

/**
 * Upload quota of demo passes (architektur-mandanten §5): every presigned upload URL of a
 * pass tenant counts atomically in the base table (`TENANT#<id>` / `QUOTA#uploads`,
 * attribute `used`, the item the tenancy service shows on the pass page). At the limit
 * the request is refused with 429 and `QuotaExceeded` (kind `uploads`) is published once
 * per pass. The owner is never counted. The counter lives in the base table, reached with
 * the function's own rights — never with the pass's vended credentials.
 */
export class UploadQuota {
  constructor(
    private readonly data: TenantDataSource,
    private readonly events: DocumentEvents,
    readonly limit: number = DEFAULT_UPLOAD_LIMIT,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Counts one upload of the tenant; throws a 429 `HttpError` once the limit is reached. */
  async consume(tenantId: string, correlationId: string): Promise<void> {
    if (tenantId === OWNER_TENANT || !isPassTenant(tenantId)) return;
    const base = await this.data(OWNER_TENANT);
    try {
      await base.db.send(
        new UpdateCommand({
          TableName: base.tableName,
          Key: quotaKey(tenantId, "uploads"),
          UpdateExpression: "ADD #used :one",
          ConditionExpression: "attribute_not_exists(#used) OR #used < :limit",
          ExpressionAttributeNames: { "#used": "used" },
          ExpressionAttributeValues: { ":one": 1, ":limit": this.limit },
        }),
      );
    } catch (error) {
      if (!isConditionFailure(error)) throw error;
      await this.reportOnce(base, tenantId, correlationId);
      throw quotaExhausted(`Die ${this.limit} Uploads des Demo-Passes sind aufgebraucht`);
    }
  }

  /**
   * Publishes `QuotaExceeded` for the first refused upload only: a conditional marker
   * (`exceededAt`) on the counter item decides which request reports. If publishing
   * fails, the marker is removed again so the next refused request reports instead.
   */
  private async reportOnce(base: TenantData, tenantId: string, correlationId: string) {
    const now = this.now().toISOString();
    try {
      await base.db.send(
        new UpdateCommand({
          TableName: base.tableName,
          Key: quotaKey(tenantId, "uploads"),
          UpdateExpression: "SET exceededAt = :now",
          ConditionExpression: "attribute_not_exists(exceededAt)",
          ExpressionAttributeValues: { ":now": now },
        }),
      );
    } catch (error) {
      if (isConditionFailure(error)) return;
      throw error;
    }
    try {
      const platform = await base.db.send(
        new GetCommand({ TableName: base.tableName, Key: platformTenantKey(tenantId) }),
      );
      const passId = platform.Item?.passId as string | undefined;
      if (!passId) {
        log("warn", "Upload quota reached for a tenant without pass", { tenantId });
        return;
      }
      await this.events.quotaExceeded({
        eventId: deterministicUuid("QuotaExceeded", passId, "uploads"),
        tenantId,
        occurredAt: now,
        correlationId,
        payload: { passId, tenantId, kind: "uploads", limit: this.limit },
      });
    } catch (error) {
      log("error", "QuotaExceeded could not be published", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      await base.db.send(
        new UpdateCommand({
          TableName: base.tableName,
          Key: quotaKey(tenantId, "uploads"),
          UpdateExpression: "REMOVE exceededAt",
        }),
      );
    }
  }
}
