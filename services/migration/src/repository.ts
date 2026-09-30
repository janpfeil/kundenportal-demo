import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { BulkMigrationCounts, LegacyAccountRef } from "@kundenportal/events";
import { tenantKey } from "@kundenportal/service-kit";
import {
  LinkOffer,
  MigrationRecord,
  MigrationRun,
  type RecordStatus,
  TimelineEntry,
} from "./model.js";

const TIMELINE_DAYS = 7;

/**
 * Items of the migration domain in the single table (fachkonzept §7.1):
 * - `TENANT#<t>#MIGRATION` / `REC#<system>#<number>` — status of one legacy record
 * - `TENANT#<t>#MIGRATION` / `RUN#<runId>` — a bulk import run with its counters
 * - `TENANT#<t>#SUBJ#<subject>` / `LINK#<system>#<number>` — link offer for a customer
 * - `TENANT#<t>#TIMELINE` / `EVT#<occurredAt>#<eventId>` — cockpit timeline, expires
 *   after seven days (`ttl`)
 *
 * The cockpit reads all records of a tenant with one query (a few dozen items in the
 * demo), so no `GSI1` is needed; a secondary index would take its own share of the 25
 * free capacity units.
 */
export class MigrationRepository {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  private migration(tenantId: string) {
    return tenantKey(tenantId, "MIGRATION");
  }

  private recordKey(tenantId: string, account: LegacyAccountRef) {
    return { PK: this.migration(tenantId), SK: `REC#${account.system}#${account.customerNumber}` };
  }

  async getRecord(tenantId: string, account: LegacyAccountRef) {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.table,
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
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
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
    return (await this.queryAll(this.migration(tenantId), "REC#")).map((item) =>
      MigrationRecord.parse(item),
    );
  }

  /** Deletes all records and runs of a tenant (demo reset); returns how many items. */
  async clearTenant(tenantId: string): Promise<number> {
    const pk = this.migration(tenantId);
    const keys = [...(await this.queryAll(pk, "REC#")), ...(await this.queryAll(pk, "RUN#"))].map(
      (item) => ({ PK: item.PK, SK: item.SK }),
    );
    for (let i = 0; i < keys.length; i += 25) {
      let requests = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
      // Provisioned capacity is small; unprocessed deletes are retried with a pause.
      for (let attempt = 0; requests.length > 0 && attempt < 8; attempt++) {
        const result = await this.db.send(
          new BatchWriteCommand({ RequestItems: { [this.table]: requests } }),
        );
        requests = (result.UnprocessedItems?.[this.table] ?? []) as typeof requests;
        if (requests.length > 0)
          await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
      }
      if (requests.length > 0) throw new Error("Demo reset: deletes were throttled; try again");
    }
    return keys.length;
  }

  async createRun(tenantId: string, run: MigrationRun): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { PK: this.migration(tenantId), SK: `RUN#${run.runId}`, ...run },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
  }

  async getRun(tenantId: string, runId: string): Promise<MigrationRun | undefined> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: this.migration(tenantId), SK: `RUN#${runId}` },
        ConsistentRead: true,
      }),
    );
    return result.Item ? MigrationRun.parse(result.Item) : undefined;
  }

  async listRuns(tenantId: string, limit = 5): Promise<MigrationRun[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.table,
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
    const adds = Object.entries(counts).filter(([, value]) => value);
    const names: Record<string, string> = { "#counts": "counts" };
    const values: Record<string, unknown> = {};
    const parts: string[] = [];
    for (const [name, value] of adds) {
      names[`#${name}`] = name;
      values[`:${name}`] = value;
      parts.push(`#counts.#${name} :${name}`);
    }
    if (options.processed) {
      values[":processed"] = options.processed;
      parts.push("processed :processed");
    }
    const set = options.dispatched === undefined ? "" : "SET dispatched = :dispatched ";
    if (options.dispatched !== undefined) values[":dispatched"] = options.dispatched;
    const result = await this.db.send(
      new UpdateCommand({
        TableName: this.table,
        Key: { PK: this.migration(tenantId), SK: `RUN#${runId}` },
        UpdateExpression: `${set}${parts.length ? `ADD ${parts.join(", ")}` : ""}`.trim(),
        ExpressionAttributeNames: adds.length ? names : undefined,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(PK)",
        ReturnValues: "ALL_NEW",
      }),
    );
    return MigrationRun.parse(result.Attributes);
  }

  /** Marks a run completed exactly once; returns false if it already was. */
  async completeRun(tenantId: string, runId: string, at: string): Promise<boolean> {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: this.migration(tenantId), SK: `RUN#${runId}` },
          UpdateExpression: "SET #status = :completed, completedAt = :at",
          ConditionExpression: "#status = :running",
          ExpressionAttributeNames: { "#status": "status" },
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
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
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
    const result = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: this.offerKey(tenantId, subject, candidate),
        ConsistentRead: true,
      }),
    );
    return result.Item ? LinkOffer.parse(result.Item) : undefined;
  }

  async listOffers(tenantId: string, subject: string): Promise<LinkOffer[]> {
    return (await this.queryAll(tenantKey(tenantId, "SUBJ", subject), "LINK#")).map((item) =>
      LinkOffer.parse(item),
    );
  }

  /** Marks the offer linked; returns false if it was already linked (double click). */
  async markOfferLinked(
    tenantId: string,
    subject: string,
    candidate: LegacyAccountRef,
    at: string,
  ): Promise<boolean> {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
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
    const ttl = Math.floor(Date.parse(entry.occurredAt) / 1000) + TIMELINE_DAYS * 86400;
    await this.db.send(
      new PutCommand({
        TableName: this.table,
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
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :evt)",
        ExpressionAttributeValues: { ":pk": tenantKey(tenantId, "TIMELINE"), ":evt": "EVT#" },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (result.Items ?? []).map((item) => TimelineEntry.parse(item));
  }

  private async queryAll(pk: string, prefix: string): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.table,
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
