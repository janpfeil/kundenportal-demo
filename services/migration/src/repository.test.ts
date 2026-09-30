import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { fixedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MigrationRepository } from "./repository.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const repository = new MigrationRepository(fixedTenantData());
const record = {
  account: { system: "telco" as const, customerNumber: "T/88-4712" },
  displayName: "Carla Schulz",
  status: "queued" as const,
  attempts: 0,
  updatedAt: "2026-09-30T12:00:00.000Z",
};

beforeEach(() => dbMock.reset());

describe("migration repository", () => {
  it("keys records per tenant and never lets a late task undo a migration", async () => {
    dbMock.on(PutCommand).resolves({});
    await repository.putRecord("owner", record);
    const input = dbMock.commandCalls(PutCommand)[0]?.args[0].input;
    expect(input?.Item).toMatchObject({ PK: "TENANT#owner#MIGRATION", SK: "REC#telco#T/88-4712" });
    expect(input?.ConditionExpression).toBe(
      "attribute_not_exists(PK) OR NOT (#status IN (:m, :l))",
    );

    await repository.putRecord("owner", { ...record, status: "migrated" }, true);
    expect(dbMock.commandCalls(PutCommand)[1]?.args[0].input.ConditionExpression).toBeUndefined();

    dbMock
      .on(PutCommand)
      .rejects(new ConditionalCheckFailedException({ message: "x", $metadata: {} }));
    expect(await repository.putRecord("owner", record)).toBe(false);
  });

  it("adds to run counters atomically and sets the number of dispatched records", async () => {
    const run = {
      runId: "r1",
      system: "telco",
      status: "running",
      startedAt: "x",
      startedBy: "s",
      processed: 1,
      counts: {
        read: 4,
        migrated: 0,
        skippedActive: 1,
        alreadyMigrated: 0,
        clarification: 0,
        failed: 0,
      },
      dispatched: 3,
    };
    dbMock.on(UpdateCommand).resolves({ Attributes: run });
    await repository.countRun("owner", "r1", { read: 4, skippedActive: 1 }, { dispatched: 3 });
    const input = dbMock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(input?.UpdateExpression).toBe(
      "SET #dispatched = :dispatched ADD #counts.#read :read, #counts.#skippedActive :skippedActive",
    );
    await repository.countRun("owner", "r1", { failed: 1 }, { processed: 1 });
    expect(dbMock.commandCalls(UpdateCommand)[1]?.args[0].input.UpdateExpression).toBe(
      "ADD #counts.#failed :failed, #processed :processed",
    );
    // DynamoDB rejects reserved words such as "processed" unless they are aliased.
    for (const call of dbMock.commandCalls(UpdateCommand)) {
      const expression = call.args[0].input.UpdateExpression ?? "";
      expect(expression).not.toMatch(/(^|[\s,])(processed|dispatched)\b/);
    }
  });

  it("writes timeline entries that expire after seven days and reads them newest first", async () => {
    dbMock.on(PutCommand).resolves({});
    dbMock.on(QueryCommand).resolves({ Items: [] }).on(GetCommand).resolves({});
    await repository.addTimeline("owner", {
      eventId: "e1",
      source: "kundenportal.migration",
      detailType: "BulkMigrationStarted",
      occurredAt: "2026-09-30T12:00:00.000Z",
      summary: "telco",
    });
    const item = dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item;
    expect(item).toMatchObject({
      PK: "TENANT#owner#TIMELINE",
      SK: "EVT#2026-09-30T12:00:00.000Z#e1",
      ttl: Date.parse("2026-10-07T12:00:00.000Z") / 1000,
    });
    await repository.listTimeline("owner");
    expect(dbMock.commandCalls(QueryCommand)[0]?.args[0].input.ScanIndexForward).toBe(false);
  });

  it("keeps link offers with the customer's identity and links them once", async () => {
    dbMock
      .on(UpdateCommand)
      .resolvesOnce({})
      .rejects(new ConditionalCheckFailedException({ message: "x", $metadata: {} }));
    const candidate = { system: "telco" as const, customerNumber: "T/88-4711" };
    expect(await repository.markOfferLinked("owner", "sub-b", candidate, "now")).toBe(true);
    expect(await repository.markOfferLinked("owner", "sub-b", candidate, "now")).toBe(false);
    expect(dbMock.commandCalls(UpdateCommand)[0]?.args[0].input.Key).toEqual({
      PK: "TENANT#owner#SUBJ#sub-b",
      SK: "LINK#telco#T/88-4711",
    });
  });

  it("clears a tenant's records and runs in batches and retries unprocessed deletes", async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      PK: "TENANT#owner#MIGRATION",
      SK: `REC#telco#${i}`,
    }));
    dbMock
      .on(QueryCommand, {
        ExpressionAttributeValues: { ":pk": "TENANT#owner#MIGRATION", ":prefix": "REC#" },
      })
      .resolves({ Items: items })
      .on(QueryCommand, {
        ExpressionAttributeValues: { ":pk": "TENANT#owner#MIGRATION", ":prefix": "RUN#" },
      })
      .resolves({ Items: [{ PK: "TENANT#owner#MIGRATION", SK: "RUN#r1" }] });
    dbMock
      .on(BatchWriteCommand)
      .resolvesOnce({
        UnprocessedItems: {
          table: [{ DeleteRequest: { Key: { PK: "TENANT#owner#MIGRATION", SK: "REC#telco#0" } } }],
        },
      })
      .resolves({});
    expect(await repository.clearTenant("owner")).toBe(31);
    const batches = dbMock
      .commandCalls(BatchWriteCommand)
      .map((c) => c.args[0].input.RequestItems?.table?.length);
    expect(batches).toEqual([25, 1, 6]);
  });

  it("clears a removed identity's link offers and the identity marker", async () => {
    const pk = "TENANT#p4k7x2qa#SUBJ#sub-c";
    dbMock
      .on(QueryCommand)
      .resolves({ Items: [{ PK: pk, SK: "LINK#utility#V-1" }] })
      .on(BatchWriteCommand)
      .resolves({});
    expect(await repository.clearSubject("p4k7x2qa", "sub-c")).toBe(2);
    expect(dbMock.commandCalls(QueryCommand)[0]?.args[0].input.ExpressionAttributeValues).toEqual({
      ":pk": pk,
      ":prefix": "LINK#",
    });
    const deletes = dbMock.commandCalls(BatchWriteCommand)[0]?.args[0].input.RequestItems?.table;
    expect(deletes?.map((d) => d.DeleteRequest?.Key)).toEqual([
      { PK: pk, SK: "LINK#utility#V-1" },
      { PK: pk, SK: "IDENTITY#LEGACY" },
    ]);
  });

  it("starts the timeline again with one marker instead of deleting every entry", async () => {
    dbMock.on(PutCommand).resolves({});
    await repository.clearTimeline("owner", "2026-09-30T12:00:00.000Z");
    expect(dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item).toMatchObject({
      PK: "TENANT#owner#TIMELINE",
      SK: "CLEARED",
      clearedAt: "2026-09-30T12:00:00.000Z",
    });
    expect(dbMock.commandCalls(BatchWriteCommand)).toHaveLength(0);
  });

  it("lists only timeline entries after the last reset", async () => {
    dbMock
      .on(GetCommand)
      .resolves({ Item: { clearedAt: "2026-09-30T12:00:00.000Z" } })
      .on(QueryCommand)
      .resolves({ Items: [] });
    await repository.listTimeline("owner");
    expect(dbMock.commandCalls(QueryCommand)[0]?.args[0].input.ExpressionAttributeValues).toEqual({
      ":pk": "TENANT#owner#TIMELINE",
      ":from": "EVT#2026-09-30T12:00:00.000Z",
      ":to": "EVT#\uffff",
    });
  });

  it("completes a run once and defines every name alias it uses", async () => {
    dbMock
      .on(UpdateCommand)
      .resolvesOnce({})
      .rejects(new ConditionalCheckFailedException({ message: "x", $metadata: {} }));
    expect(await repository.completeRun("owner", "r1", "2026-09-30T12:00:00.000Z")).toBe(true);
    expect(await repository.completeRun("owner", "r1", "2026-09-30T12:00:00.000Z")).toBe(false);
  });

  // DynamoDB rejects an expression that uses an undefined #alias; the mocks would not.
  afterEach(() => {
    for (const call of dbMock.calls()) {
      const input = call.args[0].input as {
        UpdateExpression?: string;
        ConditionExpression?: string;
        KeyConditionExpression?: string;
        ExpressionAttributeNames?: Record<string, string>;
      };
      const used = [input.UpdateExpression, input.ConditionExpression, input.KeyConditionExpression]
        .join(" ")
        .match(/#\w+/g);
      for (const alias of used ?? []) {
        expect(input.ExpressionAttributeNames?.[alias], alias).toBeDefined();
      }
    }
  });
});
