import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { BulkMigrationCounts, LegacyAccountRef } from "@kundenportal/events";
import { deleteKeys, queryKeys, tenantKey, type TenantDataSource } from "@kundenportal/service-kit";
import {
  LinkOffer,
  MigrationRecord,
  MigrationRun,
  type RecordStatus,
  TimelineEntry,
} from "./model.js";

const TIMELINE_DAYS = 7;
const TIMELINE_CLEARED = "CLEARED";

/**
 * Items of the migration domain in the single table (fachkonzept §7.1):
 * - `TENANT#<t>#MIGRATION` / `REC#<system>#<number>` — status of one legacy record
 * - `TENANT#<t>#MIGRATION` / `RUN#<runId>` — a bulk import run with its counters
 * - `TENANT#<t>#SUBJ#<subject>` / `LINK#<system>#<number>` — link offer for a customer
 * - `TENANT#<t>#TIMELINE` / `EVT#<occurredAt>#<eventId>` — cockpit timeline, expires
 *   after seven days (`ttl`); `CLEARED` marks where a demo reset started it again
 *
 * The demo reset also deletes the identity domain's `TENANT#<t>#SUBJ#<subject>` /
 * `IDENTITY#LEGACY` of the identities it removes (see `clearSubject`).
 *
 * The cockpit reads all records of a tenant with one query (a few dozen items in the
 * demo), so no `GSI1` is needed; a secondary index would take its own share of the 25
 * free capacity units.
 */
export class MigrationRepository {
  constructor(private readonly data: TenantDataSource) {}

  private migration(tenantId: string) {
    return tenantKey(tenantId, "MIGRATION");
  }

  private recordKey(tenantId: string, account: LegacyAccountRef) {
    return { PK: this.migration(tenantId), SK: `REC#${account.system}#${account.customerNumber}` };
  }

  async getRecord(tenantId: string, account: LegacyAccountRef) {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: this.recordKey(tenantId, account),
        ConsistentRead: true,
      }),
    );
    return result.Item ? MigrationRecord.parse(result.Item) : undefined;
  }

  /**
   * Stores a record. Unless `final` is set, it never overwrites a record that is already
   * migrated or linked (a late bulk task must not undo a lazy migration); returns false then.
   */
  async putRecord(tenantId: string, record: MigrationRecord, final = false): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new PutCommand({
          TableName: tableName,
          Item: { ...this.recordKey(tenantId, record.account), ...record },
          ...(final
            ? {}
            : {
                ConditionExpression: "attribute_not_exists(PK) OR NOT (#status IN (:m, :l))",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: { ":m": "migrated", ":l": "linked" },
              }),
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async listRecords(tenantId: string): Promise<MigrationRecord[]> {
    return (await this.queryAll(tenantId, this.migration(tenantId), "REC#")).map((item) =>
      MigrationRecord.parse(item),
    );
  }

  /** Deletes all records and runs of a tenant (demo reset); returns how many items. */
  async clearTenant(tenantId: string): Promise<number> {
    const table = await this.data(tenantId);
    const pk = this.migration(tenantId);
    const keys = [...(await queryKeys(table, pk, "REC#")), ...(await queryKeys(table, pk, "RUN#"))];
    return deleteKeys(table, keys);
  }

  /**
   * Deletes what the migration keeps of a removed identity (demo reset): its link offers
   * and the identity domain's marker `IDENTITY#LEGACY`. Identity has no worker that could
   * react to `MigratedAccountsRemoved`; the reset removes its marker the same way it
   * removes the Cognito user. Returns how many items.
   */
  async clearSubject(tenantId: string, subject: string): Promise<number> {
    const table = await this.data(tenantId);
    const pk = tenantKey(tenantId, "SUBJ", subject);
    const keys = [...(await queryKeys(table, pk, "LINK#")), { PK: pk, SK: "IDENTITY#LEGACY" }];
    await deleteKeys(table, keys);
    return keys.length;
  }

  /**
   * Starts the cockpit timeline of a tenant again (demo reset). Deleting hundreds of
   * entries one by one would exceed the table's 5 write units; one marker hides the older
   * entries instead, and their `ttl` removes them free of charge within seven days.
   */
  async clearTimeline(tenantId: string, at: string): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: tenantKey(tenantId, "TIMELINE"),
          SK: TIMELINE_CLEARED,
          clearedAt: at,
          ttl: Math.floor(Date.parse(at) / 1000) + TIMELINE_DAYS * 86400,
        },
      }),
    );
  }

  async createRun(tenantId: string, run: MigrationRun): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: { PK: this.migration(tenantId), SK: `RUN#${run.runId}`, ...run },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
  }

  async getRun(tenantId: string, runId: string): Promise<MigrationRun | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: this.migration(tenantId), SK: `RUN#${runId}` },
        ConsistentRead: true,
      }),
    );
    return result.Item ? MigrationRun.parse(result.Item) : undefined;
  }

  async listRuns(tenantId: string, limit = 5): Promise<MigrationRun[]> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :run)",
        ExpressionAttributeValues: { ":pk": this.migration(tenantId), ":run": "RUN#" },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (result.Items ?? []).map((item) => MigrationRun.parse(item));
  }

  /**
   * Adds to a run's counters atomically. `processed` counts records the processor
   * finished; `dispatched` is set once by the reader. Returns the run afterwards.
   */
  async countRun(
    tenantId: string,
    runId: string,
    counts: Partial<BulkMigrationCounts>,
    options: { processed?: number; dispatched?: number } = {},
  ): Promise<MigrationRun> {
    const { db, tableName } = await this.data(tenantId);
    const adds = Object.entries(counts).filter(([, value]) => value);
    const names: Record<string, string> = { "#counts": "counts" };
    const values: Record<string, unknown> = {};
    const parts: string[] = [];
    for (const [name, value] of adds) {
      names[`#${name}`] = name;
      values[`:${name}`] = value;
      parts.push(`#counts.#${name} :${name}`);
    }
    // "processed" is a reserved word in DynamoDB expressions, so every name gets an alias.
    if (options.processed) {
      names["#processed"] = "processed";
      values[":processed"] = options.processed;
      parts.push("#processed :processed");
    }
    if (options.dispatched !== undefined) names["#dispatched"] = "dispatched";
    const set = options.dispatched === undefined ? "" : "SET #dispatched = :dispatched ";
    if (options.dispatched !== undefined) values[":dispatched"] = options.dispatched;
    const result = await db.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: this.migration(tenantId), SK: `RUN#${runId}` },
        UpdateExpression: `${set}${parts.length ? `ADD ${parts.join(", ")}` : ""}`.trim(),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(PK)",
        ReturnValues: "ALL_NEW",
      }),
    );
    return MigrationRun.parse(result.Attributes);
  }

  /** Marks a run completed exactly once; returns false if it already was. */
  async completeRun(tenantId: string, runId: string, at: string): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: this.migration(tenantId), SK: `RUN#${runId}` },
          UpdateExpression: "SET #status = :completed, #completedAt = :at",
          ConditionExpression: "#status = :running",
          ExpressionAttributeNames: { "#status": "status", "#completedAt": "completedAt" },
          ExpressionAttributeValues: {
            ":completed": "completed",
            ":running": "running",
            ":at": at,
          },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  private offerKey(tenantId: string, subject: string, candidate: LegacyAccountRef) {
    return {
      PK: tenantKey(tenantId, "SUBJ", subject),
      SK: `LINK#${candidate.system}#${candidate.customerNumber}`,
    };
  }

  /** Stores an offer once; returns false if it exists already (redelivered event). */
  async putOffer(tenantId: string, subject: string, offer: LinkOffer): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new PutCommand({
          TableName: tableName,
          Item: { ...this.offerKey(tenantId, subject, offer.candidate), ...offer },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async getOffer(tenantId: string, subject: string, candidate: LegacyAccountRef) {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: this.offerKey(tenantId, subject, candidate),
        ConsistentRead: true,
      }),
    );
    return result.Item ? LinkOffer.parse(result.Item) : undefined;
  }

  async listOffers(tenantId: string, subject: string): Promise<LinkOffer[]> {
    return (await this.queryAll(tenantId, tenantKey(tenantId, "SUBJ", subject), "LINK#")).map(
      (item) => LinkOffer.parse(item),
    );
  }

  /** Marks the offer linked; returns false if it was already linked (double click). */
  async markOfferLinked(
    tenantId: string,
    subject: string,
    candidate: LegacyAccountRef,
    at: string,
  ): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new UpdateCommand({
          TableName: tableName,
          Key: this.offerKey(tenantId, subject, candidate),
          UpdateExpression: "SET #status = :linked, linkedAt = :at",
          ConditionExpression: "#status = :offered",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":linked": "linked", ":offered": "offered", ":at": at },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async addTimeline(tenantId: string, entry: TimelineEntry): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    const ttl = Math.floor(Date.parse(entry.occurredAt) / 1000) + TIMELINE_DAYS * 86400;
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: tenantKey(tenantId, "TIMELINE"),
          SK: `EVT#${entry.occurredAt}#${entry.eventId}`,
          ...entry,
          ttl,
        },
      }),
    );
  }

  async listTimeline(tenantId: string, limit = 50): Promise<TimelineEntry[]> {
    const { db, tableName } = await this.data(tenantId);
    const pk = tenantKey(tenantId, "TIMELINE");
    const marker = await db.send(
      new GetCommand({ TableName: tableName, Key: { PK: pk, SK: TIMELINE_CLEARED } }),
    );
    const clearedAt = typeof marker.Item?.clearedAt === "string" ? marker.Item.clearedAt : "";
    const result = await db.send(
      new QueryCommand({
        TableName: tableName,
        // Only entries after the last demo reset: EVT#<occurredAt> sorts by time.
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
        ExpressionAttributeValues: { ":pk": pk, ":from": `EVT#${clearedAt}`, ":to": "EVT#\uffff" },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (result.Items ?? []).map((item) => TimelineEntry.parse(item));
  }

  private async queryAll(
    tenantId: string,
    pk: string,
    prefix: string,
  ): Promise<Record<string, unknown>[]> {
    const { db, tableName } = await this.data(tenantId);
    const items: Record<string, unknown>[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const result = await db.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
          ExpressionAttributeValues: { ":pk": pk, ":prefix": prefix },
          ExclusiveStartKey: start,
        }),
      );
      items.push(...(result.Items ?? []));
      start = result.LastEvaluatedKey;
    } while (start);
    return items;
  }
}

export type { RecordStatus };
