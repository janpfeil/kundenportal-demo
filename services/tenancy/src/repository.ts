import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { inviteIndexKey, inviteKey } from "./invitation-repository.js";
import { epochSeconds, Pass, PlatformTenant, type TenantStatus } from "./model.js";
import { sha256 } from "./secrets.js";
import { SETTINGS_KEY } from "./settings-repository.js";
import { UsageRepository } from "./usage-repository.js";

export type IssueResult = "issued" | "invitation-gone" | "email-taken" | "tenants-full";

const PLATFORM = "PLATFORM";
const passKey = (passId: string) => ({ PK: `PASS#${passId}`, SK: "META" });
const tenantKey = (tenantId: string) => ({ PK: PLATFORM, SK: `TENANT#${tenantId}` });
const emailKey = (email: string) => ({ PK: `EMAIL#${sha256(email.toLowerCase())}`, SK: "PASS" });

const isConditionFailure = (error: unknown) => error instanceof ConditionalCheckFailedException;
const cancellationCodes = (error: TransactionCanceledException) =>
  error.CancellationReasons?.map((reason) => reason.Code) ?? [];

/**
 * Platform items of the tenancy domain in the base table (architektur-mandanten §1):
 * - `INVITE#<sha256(token)>` / `META` — invitation, TTL 14 days
 * - `PASS#<passId>` / `META` — the pass, kept 30 days after the teardown (TTL)
 * - `PLATFORM` / `INVITE#<invitationId>` — index of the invitations not redeemed yet
 *   (pass overview), TTL at their expiry
 * - `PLATFORM` / `TENANT#<id>` — every pass tenant with its status (reconcile, cockpit)
 * - `PLATFORM` / `SETTINGS` — kill switch, cap of concurrent pass tenants (`maxTenants`)
 *   and the counter of tenants that are not deleted (`activeTenants`)
 * - `EMAIL#<sha256(email)>` / `PASS` — one pass per address
 * - `TENANT#<id>` / `QUOTA#<kind>` — counters (`used`); the API counter also holds
 *   `lastActiveAt` and the calls per German day `d<YYYYMMDD>` (service-kit quota guard)
 * - `RATE#<sha256(ip)>` / `REDEEM` — redeem attempts per address and hour (TTL)
 * - `ALTCHA#<sha256(signature)>` / `USED` — solved challenges, against replays (TTL)
 *
 * Settings, invitations and quota counters have their own base classes
 * (`SettingsRepository`, `InvitationRepository`, `UsageRepository`) to keep each file
 * small; this class adds passes, tenants, the redeem and the rate limits.
 */
export class TenancyRepository extends UsageRepository {
  /**
   * Redeems the invitation exactly once and creates pass, platform tenant and the
   * address lock in one transaction, so a race never yields two passes. The same
   * transaction adds one to `activeTenants` only while it is below `maxTenants`, so two
   * simultaneous redeems cannot exceed the cap either.
   *
   * It also deletes the invitation's index entry, so the overview never counts a
   * redeemed invitation as open — six of the 100 items a transaction may hold, and one
   * more item (2 write units) on a redeem that already writes five. Deleting rather than
   * marking it costs the same, needs no condition (an invitation from before the index
   * has no entry; an unconditional update would create a stub of one, a conditional one
   * would cancel the redeem) and keeps the index to the open invitations.
   */
  async issuePass(
    tokenHash: string,
    now: Date,
    pass: Pass,
    tenant: PlatformTenant,
    maxTenants: number,
  ) {
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.table,
                Key: inviteKey(tokenHash),
                UpdateExpression: "SET redeemedAt = :now, passId = :passId",
                ConditionExpression:
                  "attribute_exists(PK) AND attribute_not_exists(redeemedAt) AND expiresAt > :now",
                ExpressionAttributeValues: { ":now": now.toISOString(), ":passId": pass.passId },
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: { ...passKey(pass.passId), ...pass },
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: { ...tenantKey(tenant.tenantId), ...tenant },
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: { ...emailKey(pass.email), passId: pass.passId },
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
            {
              Update: {
                TableName: this.table,
                Key: SETTINGS_KEY,
                UpdateExpression: "ADD activeTenants :one",
                ConditionExpression: "attribute_not_exists(activeTenants) OR activeTenants < :max",
                ExpressionAttributeValues: { ":one": 1, ":max": maxTenants },
              },
            },
            // Last, so the cancellation reasons above keep their positions.
            { Delete: { TableName: this.table, Key: inviteIndexKey(pass.invitationId) } },
          ],
        }),
      );
      return "issued" satisfies IssueResult;
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) throw error;
      const reasons = cancellationCodes(error);
      if (reasons[0] === "ConditionalCheckFailed") return "invitation-gone" satisfies IssueResult;
      if (reasons[3] === "ConditionalCheckFailed") return "email-taken" satisfies IssueResult;
      if (reasons[4] === "ConditionalCheckFailed") return "tenants-full" satisfies IssueResult;
      throw error;
    }
  }

  async hasPassFor(email: string): Promise<boolean> {
    const result = await this.db.send(
      new GetCommand({ TableName: this.table, Key: emailKey(email), ConsistentRead: true }),
    );
    return result.Item !== undefined;
  }

  async getPass(passId: string): Promise<Pass | undefined> {
    const result = await this.db.send(
      new GetCommand({ TableName: this.table, Key: passKey(passId), ConsistentRead: true }),
    );
    return result.Item ? Pass.parse(result.Item) : undefined;
  }

  /** Updates fields of a pass; with `keepDays` it and its address lock expire later. */
  async updatePass(pass: Pass, fields: Partial<Pass>, keepUntil?: Date): Promise<void> {
    const values = Object.entries(fields).filter(([, value]) => value !== undefined);
    const names: Record<string, string> = {};
    const attributeValues: Record<string, unknown> = {};
    const sets = values.map(([name, value], index) => {
      names[`#f${index}`] = name;
      attributeValues[`:f${index}`] = value;
      return `#f${index} = :f${index}`;
    });
    if (keepUntil) {
      names["#ttl"] = "ttl";
      attributeValues[":ttl"] = epochSeconds(keepUntil);
      sets.push("#ttl = :ttl");
    }
    if (sets.length === 0) return;
    await this.db.send(
      new UpdateCommand({
        TableName: this.table,
        Key: passKey(pass.passId),
        UpdateExpression: `SET ${sets.join(", ")}`,
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: attributeValues,
      }),
    );
    if (keepUntil) {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: emailKey(pass.email),
          UpdateExpression: "SET #ttl = :ttl",
          ExpressionAttributeNames: { "#ttl": "ttl" },
          ExpressionAttributeValues: { ":ttl": epochSeconds(keepUntil) },
        }),
      );
    }
  }

  async getTenant(tenantId: string): Promise<PlatformTenant | undefined> {
    const result = await this.db.send(
      new GetCommand({ TableName: this.table, Key: tenantKey(tenantId), ConsistentRead: true }),
    );
    return result.Item ? PlatformTenant.parse(result.Item) : undefined;
  }

  /** All pass tenants, including deleted ones (a handful in the demo). */
  async listTenants(): Promise<PlatformTenant[]> {
    const tenants: PlatformTenant[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const page = await this.db.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
          ExpressionAttributeValues: { ":pk": PLATFORM, ":prefix": "TENANT#" },
          ConsistentRead: true,
          ExclusiveStartKey: start,
        }),
      );
      tenants.push(...(page.Items ?? []).map((item) => PlatformTenant.parse(item)));
      start = page.LastEvaluatedKey;
    } while (start);
    return tenants;
  }

  /**
   * Moves a tenant to a new status; with `from` only out of these states. Returns false
   * if the tenant is missing or in another state (someone else got there first). With
   * `keepUntil` the item expires then (deleted tenants).
   */
  async setTenantStatus(
    tenantId: string,
    status: TenantStatus,
    now: Date,
    from?: TenantStatus[],
    keepUntil?: Date,
  ): Promise<boolean> {
    const allowed = from ?? [];
    const values: Record<string, unknown> = { ":status": status, ":now": now.toISOString() };
    if (keepUntil) values[":ttl"] = epochSeconds(keepUntil);
    allowed.forEach((state, index) => (values[`:from${index}`] = state));
    const condition =
      allowed.length > 0
        ? `attribute_exists(PK) AND #status IN (${allowed.map((_, index) => `:from${index}`).join(", ")})`
        : "attribute_exists(PK)";
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: tenantKey(tenantId),
          UpdateExpression: `SET #status = :status, updatedAt = :now${keepUntil ? ", #ttl = :ttl" : ""}`,
          ConditionExpression: condition,
          ExpressionAttributeNames: {
            "#status": "status",
            ...(keepUntil ? { "#ttl": "ttl" } : {}),
          },
          ExpressionAttributeValues: values,
        }),
      );
      return true;
    } catch (error) {
      if (isConditionFailure(error)) return false;
      throw error;
    }
  }

  /**
   * Moves a tenant that is not yet deleted to `deleted` (kept until `keepUntil`) and
   * removes it from `activeTenants` in the same transaction, so the counter drops exactly
   * once per tenant however often the teardown runs. A counter that is missing or
   * already 0 (drift; the reconcile repairs it) is left alone rather than going negative.
   * Returns false if the tenant is missing or already deleted.
   */
  /**
   * Records the holder's first sign-in on tenant and pass in one transaction, at most
   * once and only while the tenant is live; `validUntil` (if given) becomes the new end.
   * Returns false if it was activated before or the tenant is gone.
   */
  async activateTenant(tenant: PlatformTenant, now: Date, validUntil?: Date): Promise<boolean> {
    const set = `SET activatedAt = :now${validUntil ? ", validUntil = :until" : ""}`;
    const values = {
      ":now": now.toISOString(),
      ...(validUntil ? { ":until": validUntil.toISOString() } : {}),
    };
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.table,
                Key: tenantKey(tenant.tenantId),
                UpdateExpression: set,
                ConditionExpression:
                  "attribute_exists(PK) AND attribute_not_exists(activatedAt) AND passId = :pass AND #status IN (:s0, :s1, :s2)",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ...values,
                  ":pass": tenant.passId,
                  ":s0": "provisioning",
                  ":s1": "active",
                  ":s2": "quota-exceeded",
                },
              },
            },
            {
              Update: {
                TableName: this.table,
                Key: passKey(tenant.passId),
                UpdateExpression: set,
                ConditionExpression: "attribute_exists(PK)",
                ExpressionAttributeValues: values,
              },
            },
          ],
        }),
      );
      return true;
    } catch (error) {
      if (
        error instanceof TransactionCanceledException &&
        cancellationCodes(error).includes("ConditionalCheckFailed")
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Claims the reminder of an active tenant: sets `reminderSentAt` unless it is set
   * already, so the reminder goes out at most once (schedule and reconcile may race).
   * With `release` it removes the claim again (the mail could not be sent). Returns
   * whether the item changed.
   */
  async markReminderSent(tenantId: string, now: Date, release = false): Promise<boolean> {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: tenantKey(tenantId),
          ...(release
            ? {
                UpdateExpression: "REMOVE reminderSentAt",
                ConditionExpression: "reminderSentAt = :now",
              }
            : {
                UpdateExpression: "SET reminderSentAt = :now",
                ConditionExpression:
                  "attribute_exists(PK) AND attribute_not_exists(reminderSentAt) AND #status = :active",
                ExpressionAttributeNames: { "#status": "status" },
              }),
          ExpressionAttributeValues: {
            ":now": now.toISOString(),
            ...(release ? {} : { ":active": "active" }),
          },
        }),
      );
      return true;
    } catch (error) {
      if (isConditionFailure(error)) return false;
      throw error;
    }
  }

  async markTenantDeleted(tenantId: string, now: Date, keepUntil: Date): Promise<boolean> {
    const tenantUpdate = {
      TableName: this.table,
      Key: tenantKey(tenantId),
      UpdateExpression: "SET #status = :status, updatedAt = :now, #ttl = :ttl",
      ConditionExpression: "attribute_exists(PK) AND #status <> :status",
      ExpressionAttributeNames: { "#status": "status", "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":status": "deleted",
        ":now": now.toISOString(),
        ":ttl": epochSeconds(keepUntil),
      },
    };
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            { Update: tenantUpdate },
            {
              Update: {
                TableName: this.table,
                Key: SETTINGS_KEY,
                UpdateExpression: "ADD activeTenants :minusOne",
                ConditionExpression: "activeTenants > :zero",
                ExpressionAttributeValues: { ":minusOne": -1, ":zero": 0 },
              },
            },
          ],
        }),
      );
      return true;
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) throw error;
      const reasons = cancellationCodes(error);
      if (reasons[0] === "ConditionalCheckFailed") return false;
      if (reasons[1] !== "ConditionalCheckFailed") throw error;
    }
    try {
      await this.db.send(new UpdateCommand(tenantUpdate));
      return true;
    } catch (error) {
      if (isConditionFailure(error)) return false;
      throw error;
    }
  }

  /**
   * Counts one attempt in the hourly window of `key`; false once `limit` attempts are
   * used. A window whose `ttl` has passed starts over (TTL deletion lags behind).
   */
  async countAttempt(key: string, limit: number, now: Date): Promise<boolean> {
    const Key = { PK: `RATE#${key}`, SK: "REDEEM" };
    const nowSeconds = epochSeconds(now);
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key,
          UpdateExpression: "SET attempts = :one, #ttl = :ttl",
          ConditionExpression: "attribute_not_exists(PK) OR #ttl <= :now",
          ExpressionAttributeNames: { "#ttl": "ttl" },
          ExpressionAttributeValues: { ":one": 1, ":ttl": nowSeconds + 3600, ":now": nowSeconds },
        }),
      );
      return true;
    } catch (error) {
      if (!isConditionFailure(error)) throw error;
    }
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key,
          UpdateExpression: "ADD attempts :one",
          ConditionExpression: "attempts < :limit",
          ExpressionAttributeValues: { ":one": 1, ":limit": limit },
        }),
      );
      return true;
    } catch (error) {
      if (isConditionFailure(error)) return false;
      throw error;
    }
  }

  /** Marks a solved ALTCHA challenge as used; false if it was used before (replay). */
  async useChallenge(signature: string, expiresAt: Date): Promise<boolean> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: { PK: `ALTCHA#${sha256(signature)}`, SK: "USED", ttl: epochSeconds(expiresAt) },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
      return true;
    } catch (error) {
      if (isConditionFailure(error)) return false;
      throw error;
    }
  }
}
