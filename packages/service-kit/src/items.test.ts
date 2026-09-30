import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteKeys, queryKeys } from "./items.js";

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
