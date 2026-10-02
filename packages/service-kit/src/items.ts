import { BatchWriteCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { TenantData } from "./tenant-data.js";

/** Primary key of an item in the single table. */
export interface ItemKey {
  PK: string;
  SK: string;
}

type Table = Pick<TenantData, "db" | "tableName">;

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 8;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Pace of a one-off maintenance run (backfill): small pages, pauses in between. */
export interface Pace {
  /** Items per Scan page; a page of small items costs a few read units. */
  pageSize?: number;
  /** Pause after each page, so the run stays far below the table's read capacity. */
  pauseMs?: number;
  /** Replaceable in tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Every item of a tenant whose partition key starts with `TENANT#<t>#<prefix>`, page by
 * page — a Scan, so only for one-off maintenance runs, never on a request path. Pass tenants
 * have their own table; the owner's items share the base table with the platform's.
 */
export async function* scanTenant(
  table: Table,
  pkPrefix: string,
  pace: Pace = {},
): AsyncGenerator<Record<string, unknown>[]> {
  const pause = pace.sleep ?? sleep;
  let start: Record<string, unknown> | undefined;
  do {
    const result = await table.db.send(
      new ScanCommand({
        TableName: table.tableName,
        FilterExpression: "begins_with(PK, :prefix)",
        ExpressionAttributeValues: { ":prefix": pkPrefix },
        Limit: pace.pageSize ?? 100,
        ExclusiveStartKey: start,
      }),
    );
    if (result.Items?.length) yield result.Items;
    start = result.LastEvaluatedKey;
    if (start) await pause(pace.pauseMs ?? 1000);
  } while (start);
}

/**
 * Spaces writes of a maintenance run to at most `perSecond` (the demo's tables have 5 write
 * units): call it before each write.
 */
export function writePacer(
  perSecond: number,
  wait: (ms: number) => Promise<void> = sleep,
  now: () => number = Date.now,
): () => Promise<void> {
  const gap = 1000 / perSecond;
  let next = 0;
  return async () => {
    const at = now();
    if (next > at) await wait(next - at);
    next = Math.max(at, next) + gap;
  };
}

/** Keys of all items of a partition, optionally only those whose sort key has a prefix. */
export async function queryKeys(table: Table, pk: string, skPrefix?: string): Promise<ItemKey[]> {
  const keys: ItemKey[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const result = await table.db.send(
      new QueryCommand({
        TableName: table.tableName,
        KeyConditionExpression:
          skPrefix === undefined ? "PK = :pk" : "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": pk,
          ...(skPrefix === undefined ? {} : { ":prefix": skPrefix }),
        },
        ProjectionExpression: "PK, SK",
        ExclusiveStartKey: start,
      }),
    );
    for (const item of result.Items ?? []) keys.push({ PK: item.PK, SK: item.SK } as ItemKey);
    start = result.LastEvaluatedKey;
  } while (start);
  return keys;
}

/**
 * Deletes items in batches of 25 and returns how many. The tables' provisioned capacity
 * is small, so DynamoDB may leave deletes unprocessed; they are retried with a growing
 * pause. Deleting a missing item is no error, so a repeated call is harmless.
 */
export async function deleteKeys(
  table: Table,
  keys: readonly ItemKey[],
  pause: (ms: number) => Promise<unknown> = sleep,
): Promise<number> {
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    let requests = keys
      .slice(i, i + BATCH_SIZE)
      .map((key) => ({ DeleteRequest: { Key: { PK: key.PK, SK: key.SK } } }));
    for (let attempt = 0; requests.length > 0 && attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await pause(200 * 2 ** (attempt - 1));
      const result = await table.db.send(
        new BatchWriteCommand({ RequestItems: { [table.tableName]: requests } }),
      );
      requests = (result.UnprocessedItems?.[table.tableName] ?? []) as typeof requests;
    }
    if (requests.length > 0) throw new Error("Deletes were throttled; try again");
  }
  return keys.length;
}
