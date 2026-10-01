import { DeleteCommand, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { QuotaKind } from "@kundenportal/events";
import { dayAttribute } from "@kundenportal/service-kit";
import { InvitationRepository } from "./invitation-repository.js";

const quotaKey = (tenantId: string, kind: QuotaKind) => ({
  PK: `TENANT#${tenantId}`,
  SK: `QUOTA#${kind}`,
});

/**
 * Quota counters of the pass tenants, `TENANT#<id>` / `QUOTA#<kind>` with `used`. The
 * API counter is written by the quota guard of every service (service-kit), which also
 * records `lastActiveAt` and the calls per German day `d<YYYYMMDD>` there.
 */
export class UsageRepository extends InvitationRepository {
  async getQuotaUsage(tenantId: string): Promise<Record<QuotaKind, number>> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": `TENANT#${tenantId}`, ":prefix": "QUOTA#" },
      }),
    );
    const usage: Record<QuotaKind, number> = { api: 0, events: 0, uploads: 0 };
    for (const item of result.Items ?? []) {
      const kind = QuotaKind.safeParse(String(item.SK).slice("QUOTA#".length));
      if (kind.success) usage[kind.data] = Number(item.used ?? 0);
    }
    return usage;
  }

  /**
   * Last API call of the tenant: the API quota guard (service-kit) records `lastActiveAt`
   * with the counter; undefined before the first call.
   */
  async getLastActivity(tenantId: string): Promise<string | undefined> {
    const result = await this.db.send(
      new GetCommand({ TableName: this.table, Key: quotaKey(tenantId, "api") }),
    );
    const value = result.Item?.lastActiveAt;
    return typeof value === "string" ? value : undefined;
  }

  /**
   * API calls of the tenant on the given German dates (`YYYY-MM-DD`), from the day
   * counters `d<YYYYMMDD>` the quota guard adds with the total; 0 for a day without
   * calls. One read of one item, only the requested attributes.
   */
  async getApiCalls(tenantId: string, dates: string[]): Promise<Record<string, number>> {
    const names = Object.fromEntries(
      dates.map((date, index) => [`#d${index}`, dayAttribute(date)]),
    );
    const result = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: quotaKey(tenantId, "api"),
        ProjectionExpression: Object.keys(names).join(", "),
        ExpressionAttributeNames: names,
      }),
    );
    return Object.fromEntries(
      dates.map((date) => [date, Number(result.Item?.[dayAttribute(date)] ?? 0)]),
    );
  }

  /** Adds one to a counter and returns the new value. */
  async addUsage(tenantId: string, kind: QuotaKind): Promise<number> {
    const result = await this.db.send(
      new UpdateCommand({
        TableName: this.table,
        Key: quotaKey(tenantId, kind),
        UpdateExpression: "ADD used :one",
        ExpressionAttributeValues: { ":one": 1 },
        ReturnValues: "UPDATED_NEW",
      }),
    );
    return Number(result.Attributes?.used ?? 0);
  }

  /** Removes the counters of a torn-down tenant. */
  async deleteUsage(tenantId: string): Promise<void> {
    for (const kind of QuotaKind.options) {
      await this.db.send(
        new DeleteCommand({ TableName: this.table, Key: quotaKey(tenantId, kind) }),
      );
    }
  }
}
