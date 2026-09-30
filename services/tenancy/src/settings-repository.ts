import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { type DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { OWNER_CLOSED_REASON, Settings, type SettingsChange } from "./model.js";

/** `PLATFORM` / `SETTINGS`: kill switch, cap and counter of pass tenants. */
export const SETTINGS_KEY = { PK: "PLATFORM", SK: "SETTINGS" };

const isConditionFailure = (error: unknown) => error instanceof ConditionalCheckFailedException;

/**
 * The settings item of the tenancy domain in the base table (architektur-mandanten §1).
 * The redeem and the teardown change `activeTenants` inside their own transactions
 * (`TenancyRepository`); this class reads it and serves the kill switch, the owner's
 * settings and the reconcile.
 */
export class SettingsRepository {
  constructor(
    protected readonly db: DynamoDBDocumentClient,
    protected readonly table: string,
  ) {}

  /**
   * Sets `activeTenants` to `count` (daily reconcile), but only if it still has the value
   * read before counting (`seen`, `undefined` = missing). A redeem or teardown in between
   * changed it; then the correction waits for the next run. Returns whether it was set.
   */
  async setActiveTenants(count: number, seen: number | undefined): Promise<boolean> {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: SETTINGS_KEY,
          UpdateExpression: "SET activeTenants = :count",
          ConditionExpression:
            seen === undefined ? "attribute_not_exists(activeTenants)" : "activeTenants = :seen",
          ExpressionAttributeValues: {
            ":count": count,
            ...(seen === undefined ? {} : { ":seen": seen }),
          },
        }),
      );
      return true;
    } catch (error) {
      if (isConditionFailure(error)) return false;
      throw error;
    }
  }

  async getSettings(): Promise<Settings> {
    const result = await this.db.send(
      new GetCommand({ TableName: this.table, Key: SETTINGS_KEY, ConsistentRead: true }),
    );
    return Settings.parse(result.Item ?? {});
  }

  /** Kill switch: no further redemptions; running passes stay usable. */
  async closeRedemption(now: Date, reason: string): Promise<void> {
    await this.db.send(
      new UpdateCommand({
        TableName: this.table,
        Key: SETTINGS_KEY,
        UpdateExpression: "SET redemption = :closed, closedAt = :now, closedReason = :reason",
        ExpressionAttributeValues: {
          ":closed": "closed",
          ":now": now.toISOString(),
          ":reason": reason,
        },
      }),
    );
  }

  /**
   * The owner's change of the settings; returns the settings afterwards. Reopening
   * removes `closedAt` and `closedReason`; closing keeps an earlier reason (e.g. the
   * budget alarm's) and otherwise records the owner.
   */
  async updateSettings(change: SettingsChange, now: Date): Promise<Settings> {
    const sets: string[] = [];
    const removes: string[] = [];
    const values: Record<string, unknown> = {};
    if (change.maxTenants !== undefined) {
      sets.push("maxTenants = :max");
      values[":max"] = change.maxTenants;
    }
    if (change.redemption === "open") {
      sets.push("redemption = :open");
      values[":open"] = "open";
      removes.push("closedAt", "closedReason");
    } else if (change.redemption === "closed") {
      sets.push(
        "redemption = :closed",
        "closedAt = if_not_exists(closedAt, :now)",
        "closedReason = if_not_exists(closedReason, :reason)",
      );
      Object.assign(values, {
        ":closed": "closed",
        ":now": now.toISOString(),
        ":reason": OWNER_CLOSED_REASON,
      });
    }
    if (sets.length === 0) return this.getSettings();
    const remove = removes.length > 0 ? ` REMOVE ${removes.join(", ")}` : "";
    const result = await this.db.send(
      new UpdateCommand({
        TableName: this.table,
        Key: SETTINGS_KEY,
        UpdateExpression: `SET ${sets.join(", ")}${remove}`,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      }),
    );
    return Settings.parse(result.Attributes ?? {});
  }
}
