import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteKeys, queryKeys, scanTenant, writePacer } from "./items.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const table = { db: DynamoDBDocumentClient.from(new DynamoDBClient({})), tableName: "t" };
const noPause = async () => undefined;

beforeEach(() => dbMock.reset());

describe("queryKeys", () => {
  it("collects the keys of every page, with or without a sort key prefix", async () => {
    dbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [{ PK: "P", SK: "DOC#1" }], LastEvaluatedKey: { PK: "P", SK: "x" } })
      .resolves({ Items: [{ PK: "P", SK: "DOC#2" }] });
    expect(await queryKeys(table, "P", "DOC#")).toEqual([
      { PK: "P", SK: "DOC#1" },
      { PK: "P", SK: "DOC#2" },
    ]);
    const [first, second] = dbMock.commandCalls(QueryCommand).map((c) => c.args[0].input);
    expect(first?.ExpressionAttributeValues).toEqual({ ":pk": "P", ":prefix": "DOC#" });
    expect(second?.ExclusiveStartKey).toEqual({ PK: "P", SK: "x" });

    dbMock.reset();
    dbMock.on(QueryCommand).resolves({});
    expect(await queryKeys(table, "P")).toEqual([]);
    expect(dbMock.commandCalls(QueryCommand)[0]?.args[0].input.KeyConditionExpression).toBe(
      "PK = :pk",
    );
  });
});

describe("deleteKeys", () => {
  const keys = Array.from({ length: 30 }, (_, i) => ({ PK: "P", SK: `N#${i}` }));

  it("deletes in batches of 25 and retries unprocessed deletes", async () => {
    dbMock
      .on(BatchWriteCommand)
      .resolvesOnce({ UnprocessedItems: { t: [{ DeleteRequest: { Key: keys[0] } }] } })
      .resolves({});
    expect(await deleteKeys(table, keys, noPause)).toBe(30);
    const sizes = dbMock
      .commandCalls(BatchWriteCommand)
      .map((c) => c.args[0].input.RequestItems?.t?.length);
    expect(sizes).toEqual([25, 1, 5]);
  });

  it("does nothing without keys and gives up when DynamoDB keeps throttling", async () => {
    expect(await deleteKeys(table, [], noPause)).toBe(0);
    expect(dbMock.commandCalls(BatchWriteCommand)).toHaveLength(0);
    dbMock
      .on(BatchWriteCommand)
      .resolves({ UnprocessedItems: { t: [{ DeleteRequest: { Key: keys[0] } }] } });
    await expect(deleteKeys(table, keys.slice(0, 1), noPause)).rejects.toThrow(/throttled/);
    expect(dbMock.commandCalls(BatchWriteCommand)).toHaveLength(8);
  });
});

describe("scanTenant", () => {
  it("yields the tenant's items page by page with a pause between pages", async () => {
    dbMock
      .on(ScanCommand)
      .resolvesOnce({ Items: [{ PK: "TENANT#o#CUST#1" }], LastEvaluatedKey: { PK: "a", SK: "b" } })
      .resolvesOnce({ Items: [], LastEvaluatedKey: { PK: "c", SK: "d" } })
      .resolves({ Items: [{ PK: "TENANT#o#CUST#2" }] });
    const pauses: number[] = [];
    const pages: unknown[] = [];
    for await (const page of scanTenant(table, "TENANT#o#CUST#", {
      pageSize: 50,
      pauseMs: 700,
      sleep: async (ms) => void pauses.push(ms),
    })) {
      pages.push(page);
    }
    // Empty pages are skipped, the scan goes on until DynamoDB has no more.
    expect(pages).toEqual([[{ PK: "TENANT#o#CUST#1" }], [{ PK: "TENANT#o#CUST#2" }]]);
    expect(pauses).toEqual([700, 700]);
    const inputs = dbMock.commandCalls(ScanCommand).map((c) => c.args[0].input);
    expect(inputs[0]).toMatchObject({
      Limit: 50,
      FilterExpression: "begins_with(PK, :prefix)",
      ExpressionAttributeValues: { ":prefix": "TENANT#o#CUST#" },
    });
    expect(inputs[2]?.ExclusiveStartKey).toEqual({ PK: "c", SK: "d" });
  });
});

describe("writePacer", () => {
  it("spaces writes to the given rate and lets a late write go at once", async () => {
    let clock = 0;
    const waits: number[] = [];
    const pace = writePacer(
      4,
      async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      () => clock,
    );
    await pace();
    await pace();
    await pace();
    expect(waits).toEqual([250, 250]);
    clock += 1000;
    await pace();
    expect(waits).toEqual([250, 250]);
  });
});
