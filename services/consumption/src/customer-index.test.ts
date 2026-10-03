import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { fixedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import type { ContractProjection } from "./model.js";
import { backfillCustomerIndex } from "./index-backfill.js";
import { ConsumptionRepository } from "./repository.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const data = fixedTenantData();
const repository = new ConsumptionRepository(data);
const contractId = "1c7a4a8f-2d3e-4f60-9bac-1d2e3f4a5b6c";
const projection = (customerId: string, version = 1): ContractProjection => ({
  contractId,
  customerId,
  division: "electricity",
  status: "active",
  version,
  startDate: "2026-04-05",
});

beforeEach(() => {
  dbMock.reset();
  dbMock.on(PutCommand).resolves({});
  dbMock.on(DeleteCommand).resolves({});
  dbMock.on(GetCommand).resolves({});
});

describe("customer index", () => {
  it("writes the customer's index entry with the projection", async () => {
    expect(await repository.saveContract("owner", projection("c-1"))).toBe(true);

    const items = dbMock.commandCalls(PutCommand).map((call) => call.args[0].input.Item);
    expect(items[1]).toEqual({
      PK: "TENANT#owner#CUST#c-1",
      SK: `CONSUMPTION#${contractId}`,
      contractId,
    });
    expect(dbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });

  it("moves the entry when account linking hands the contract to another customer", async () => {
    dbMock
      .on(PutCommand, { Item: { SK: "CONSUMPTION" } }, false)
      .resolves({ Attributes: projection("c-1") });

    await repository.saveContract("owner", projection("c-9", 2));

    expect(dbMock.commandCalls(PutCommand)[1]?.args[0].input.Item).toMatchObject({
      PK: "TENANT#owner#CUST#c-9",
    });
    expect(dbMock.commandCalls(DeleteCommand)[0]?.args[0].input.Key).toEqual({
      PK: "TENANT#owner#CUST#c-1",
      SK: `CONSUMPTION#${contractId}`,
    });
  });

  it("writes no entry for a stale snapshot", async () => {
    dbMock
      .on(PutCommand)
      .rejects(new ConditionalCheckFailedException({ message: "newer", $metadata: {} }));

    expect(await repository.saveContract("owner", projection("c-1"))).toBe(false);
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(1);
  });
});

describe("backfillCustomerIndex", () => {
  it("indexes every projection once, paced, and leaves a mark", async () => {
    dbMock
      .on(ScanCommand)
      .resolvesOnce({
        Items: [
          {
            PK: `TENANT#owner#CONTRACT#${contractId}`,
            SK: "CONSUMPTION",
            contractId,
            customerId: "c-1",
          },
          { PK: `TENANT#owner#CONTRACT#${contractId}`, SK: "READING#2026-04-05#r-1" },
        ],
        LastEvaluatedKey: { PK: "x", SK: "y" },
      })
      .resolves({
        Items: [
          {
            PK: "TENANT#owner#CONTRACT#k-2",
            SK: "CONSUMPTION",
            contractId: "k-2",
            customerId: "c-2",
          },
        ],
      });
    let elapsed = 0;
    const waits: number[] = [];

    const result = await backfillCustomerIndex(data, repository, "owner", {
      now: () => new Date("2026-10-03T10:00:00.000Z"),
      wait: async (ms) => {
        waits.push(ms);
        elapsed += ms;
      },
      clock: () => elapsed,
    });

    expect(result).toEqual({ contracts: 2 });
    const items = dbMock.commandCalls(PutCommand).map((call) => call.args[0].input.Item);
    expect(items).toEqual([
      { PK: "TENANT#owner#CUST#c-1", SK: `CONSUMPTION#${contractId}`, contractId },
      { PK: "TENANT#owner#CUST#c-2", SK: "CONSUMPTION#k-2", contractId: "k-2" },
      {
        PK: "TENANT#owner#BACKFILL",
        SK: "CONSUMPTION#v1",
        finishedAt: "2026-10-03T10:00:00.000Z",
        contracts: 2,
      },
    ]);
    expect(dbMock.commandCalls(ScanCommand)[0]?.args[0].input.ExpressionAttributeValues).toEqual({
      ":prefix": "TENANT#owner#CONTRACT",
    });
    // The pause between the pages already spaces the second write.
    expect(waits).toEqual([1000]);
  });

  it("does nothing once a run has finished", async () => {
    dbMock.on(GetCommand).resolves({ Item: { finishedAt: "2026-10-03T09:00:00.000Z" } });

    expect(await backfillCustomerIndex(data, repository, "owner")).toEqual({
      contracts: 0,
      finishedBefore: "2026-10-03T09:00:00.000Z",
    });
    expect(dbMock.commandCalls(ScanCommand)).toHaveLength(0);
  });
});
