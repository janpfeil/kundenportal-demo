import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ContractSnapshot } from "@kundenportal/events";
import { fixedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { backfillCustomerDirectory } from "./directory-backfill.js";
import { CustomerRepository } from "./repository.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const data = fixedTenantData();
const repository = new CustomerRepository(data);

const profileItem = (customerId: string, extra: Record<string, unknown> = {}) => ({
  PK: `TENANT#owner#CUST#${customerId}`,
  SK: "PROFILE",
  customerId,
  email: `${customerId}@example.org`,
  displayName: customerId,
  locale: "de",
  origin: "registration",
  createdAt: "2026-09-29T12:00:00.000Z",
  ...extra,
});

/** The fields of a snapshot the directory keeps (the rest does not matter here). */
const snapshot = (customerId: string, contractId: string, version: number) =>
  ({
    customerId,
    contractId,
    division: "electricity",
    status: "active",
    startDate: "2026-04-05",
    version,
  }) as unknown as ContractSnapshot;

let elapsed = 0;
const waits: number[] = [];
const options = {
  clock: { now: () => new Date("2026-10-02T10:00:00.000Z") },
  wait: async (ms: number) => {
    waits.push(ms);
    elapsed += ms;
  },
  now: () => elapsed,
};

const puts = () => dbMock.commandCalls(PutCommand).map((c) => c.args[0].input);

beforeEach(() => {
  dbMock.reset();
  elapsed = 0;
  waits.length = 0;
  dbMock.on(GetCommand).resolves({});
  dbMock.on(PutCommand).resolves({});
  dbMock.on(UpdateCommand).resolves({});
  // Directory: c-listed with profile and contract k-2 (version 3).
  dbMock.on(QueryCommand).resolves({
    Items: [
      { ...profileItem("c-listed"), PK: "TENANT#owner#CUSTOMERS", SK: "CUST#c-listed", rev: 1 },
      {
        PK: "TENANT#owner#CUSTOMERS",
        SK: "CUST#c-listed#C#k-2",
        ...snapshot("c-listed", "k-2", 3),
      },
    ],
  });
  dbMock
    .on(ScanCommand)
    .resolvesOnce({
      Items: [profileItem("c-old"), { PK: "TENANT#owner#CUST#c-old", SK: "CONTRACT#x" }],
      LastEvaluatedKey: { PK: "a", SK: "b" },
    })
    .resolves({ Items: [profileItem("c-listed", { listed: true, rev: 1 })] });
});

describe("backfillCustomerDirectory", () => {
  it("adds the profiles and contract summaries that are missing, nothing else", async () => {
    const result = await backfillCustomerDirectory(
      data,
      repository,
      "owner",
      [snapshot("c-old", "k-1", 1), snapshot("c-listed", "k-2", 3), snapshot("c-listed", "k-3", 2)],
      options,
    );

    expect(result).toEqual({ profiles: 2, addedProfiles: 1, addedContracts: 2 });
    const items = puts().map((input) => input.Item);
    expect(items).toEqual([
      expect.objectContaining({ PK: "TENANT#owner#CUSTOMERS", SK: "CUST#c-old", rev: 0 }),
      expect.objectContaining({ SK: "CUST#c-old#C#k-1", version: 1 }),
      expect.objectContaining({ SK: "CUST#c-listed#C#k-3", version: 2 }),
      {
        PK: "TENANT#owner#BACKFILL",
        SK: "CUSTOMERS#v1",
        finishedAt: "2026-10-02T10:00:00.000Z",
        profiles: 2,
        addedProfiles: 1,
        addedContracts: 2,
      },
    ]);
    // The profile is marked as listed, like after its next /me.
    const mark = dbMock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(mark?.Key).toEqual({ PK: "TENANT#owner#CUST#c-old", SK: "PROFILE" });
    // The scan reads the tenant's customer partitions only.
    expect(dbMock.commandCalls(ScanCommand)[0]?.args[0].input.ExpressionAttributeValues).toEqual({
      ":prefix": "TENANT#owner#CUST",
    });
    // 4 writes at 2 per second (the mark at the end is not paced) and one pause between pages.
    expect(waits).toEqual([1000, 500, 500, 500]);
  });

  it("counts a stale contract summary as not added and goes on", async () => {
    dbMock
      .on(PutCommand, { Item: { SK: "CUST#c-old#C#k-1" } }, false)
      .rejects(new ConditionalCheckFailedException({ message: "newer", $metadata: {} }));

    const result = await backfillCustomerDirectory(
      data,
      repository,
      "owner",
      [snapshot("c-old", "k-1", 1)],
      options,
    );

    expect(result.addedContracts).toBe(0);
    expect(result.addedProfiles).toBe(1);
  });

  it("does nothing once a run has finished", async () => {
    dbMock.on(GetCommand).resolves({ Item: { finishedAt: "2026-10-02T09:00:00.000Z" } });

    const result = await backfillCustomerDirectory(
      data,
      repository,
      "owner",
      [snapshot("c-old", "k-1", 1)],
      options,
    );

    expect(result).toEqual({
      profiles: 0,
      addedProfiles: 0,
      addedContracts: 0,
      finishedBefore: "2026-10-02T09:00:00.000Z",
    });
    expect(dbMock.commandCalls(ScanCommand)).toHaveLength(0);
    expect(puts()).toHaveLength(0);
  });
});
