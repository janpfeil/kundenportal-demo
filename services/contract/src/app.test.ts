import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ContractChanged } from "@kundenportal/events";
import { apiEvent, fixedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.js";
import { demoContracts } from "./contract.js";
import { ContractEvents } from "./publisher.js";
import { ContractRepository } from "./repository.js";
import { ContractService } from "./service.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const ebMock = mockClient(EventBridgeClient);

const api = createApi(
  new ContractService(
    new ContractRepository(fixedTenantData()),
    new ContractEvents(new EventBridgeClient({}), "bus"),
    { now: () => new Date("2026-09-30T13:00:00.000Z") },
  ),
);

const [electricity, gas, mobile] = demoContracts(
  "c-1",
  "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  "2026-09-30T12:00:00.000Z",
);
if (!electricity || !gas || !mobile) throw new Error("demo contracts missing");
const items = [electricity, gas, mobile].map((c) => ({
  PK: "TENANT#owner#CUST#c-1",
  SK: `CONTRACT#${c.division}#${c.contractId}`,
  ...c,
}));
const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "null");

const patch = (contractId: string, payload: unknown) =>
  api(apiEvent("PATCH /contracts/{contractId}", { pathParameters: { contractId }, body: payload }));

beforeEach(() => {
  dbMock.reset();
  ebMock.reset();
  dbMock.on(GetCommand).resolves({});
  dbMock
    .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "CONTRACTS" } })
    .resolves({ Item: { customerId: "c-1" } });
  dbMock.on(QueryCommand).resolves({ Items: items });
  dbMock.on(PutCommand).resolves({});
  ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });
});

describe("GET /contracts", () => {
  it("lists the caller's contracts without storage keys", async () => {
    const result = await api(apiEvent("GET /contracts"));

    expect(result.statusCode).toBe(200);
    const list = body(result).items;
    expect(list.map((c: { division: string }) => c.division)).toEqual([
      "electricity",
      "gas",
      "mobile",
    ]);
    expect(list[0]).toMatchObject({
      contractId: electricity.contractId,
      tariffName: "Strom Klassik",
      tariffOptions: ["standard", "oeko"],
      monthlyInstallmentCent: 8700,
      installmentAdjustable: true,
      installmentMinCent: 6900,
      installmentMaxCent: 13100,
      workPriceCent: 32,
      minimumTermEndDate: "2027-04-03",
    });
    expect(list[2]).toMatchObject({ installmentAdjustable: false, dataVolumeMb: 20480 });
    for (const key of ["PK", "SK", "customerId", "version", "startReading"])
      expect(list[0]).not.toHaveProperty(key);
    const input = dbMock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(input?.ExpressionAttributeValues?.[":pk"]).toBe("TENANT#owner#CUST#c-1");
  });

  it("returns an empty list before CustomerRegistered reached the contract domain", async () => {
    const result = await api(apiEvent("GET /contracts", { claims: { sub: "sub-new" } }));
    expect(body(result)).toEqual({ items: [] });
    expect(dbMock.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it("scopes the lookup to the caller's tenant", async () => {
    await api(apiEvent("GET /contracts", { claims: { tenant_id: "other" } }));
    expect(dbMock.commandCalls(GetCommand)[0]?.args[0].input.Key?.PK).toBe(
      "TENANT#other#SUBJ#sub-1",
    );
  });
});

describe("GET /contracts/{contractId}", () => {
  const get = (contractId: string) =>
    api(apiEvent("GET /contracts/{contractId}", { pathParameters: { contractId } }));

  it("returns one contract of the caller", async () => {
    const result = await get(gas.contractId);
    expect(result.statusCode).toBe(200);
    expect(body(result)).toMatchObject({ division: "gas", unit: "m3" });
  });

  it("answers 404 for contracts of other customers and 400 for malformed ids", async () => {
    expect((await get("0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b")).statusCode).toBe(404);
    expect((await get("../x")).statusCode).toBe(400);
  });
});

describe("PATCH /contracts/{contractId}", () => {
  it("sets the installment within the allowed range and publishes ContractChanged", async () => {
    const result = await patch(electricity.contractId, { monthlyInstallmentCent: 10000 });

    expect(result.statusCode).toBe(200);
    expect(body(result)).toMatchObject({ monthlyInstallmentCent: 10000 });
    const put = dbMock.commandCalls(PutCommand)[0]?.args[0].input;
    expect(put?.Item).toMatchObject({
      PK: "TENANT#owner#CUST#c-1",
      SK: `CONTRACT#electricity#${electricity.contractId}`,
      monthlyInstallmentCent: 10000,
      version: 2,
    });
    expect(put?.ExpressionAttributeValues).toEqual({ ":expected": 1 });

    const entry = ebMock.commandCalls(PutEventsCommand)[0]?.args[0].input.Entries?.[0];
    expect(entry).toMatchObject({
      EventBusName: "bus",
      Source: "kundenportal.contract",
      DetailType: "ContractChanged",
    });
    const detail = ContractChanged.detail.parse(JSON.parse(entry?.Detail ?? "{}"));
    expect(detail).toMatchObject({
      tenantId: "owner",
      correlationId: "req-1",
      payload: {
        changeType: "updated",
        changes: ["installment"],
        previous: { monthlyInstallmentCent: 8700, tariffOption: "standard" },
        contract: { contractId: electricity.contractId, monthlyInstallmentCent: 10000, version: 2 },
      },
    });
  });

  it("changes the mobile option together with price and data volume", async () => {
    const result = await patch(mobile.contractId, { tariffOption: "40gb" });
    expect(body(result)).toMatchObject({
      tariffOption: "40gb",
      monthlyInstallmentCent: 2999,
      dataVolumeMb: 40960,
    });
    const detail = JSON.parse(
      ebMock.commandCalls(PutEventsCommand)[0]?.args[0].input.Entries?.[0]?.Detail ?? "{}",
    );
    expect(detail.payload.changes).toEqual(["installment", "tariffOption"]);
  });

  it("moves the range with a new option of a metered contract", async () => {
    const result = await patch(electricity.contractId, { tariffOption: "oeko" });
    expect(body(result)).toMatchObject({ tariffOption: "oeko", workPriceCent: 34 });
  });

  it("does nothing and publishes nothing if the values do not change", async () => {
    const result = await patch(electricity.contractId, { monthlyInstallmentCent: 8700 });
    expect(result.statusCode).toBe(200);
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(0);
  });

  it.each([
    ["below the range", electricity.contractId, { monthlyInstallmentCent: 5000 }],
    ["above the range", electricity.contractId, { monthlyInstallmentCent: 20000 }],
    ["not whole euros", electricity.contractId, { monthlyInstallmentCent: 9050 }],
    ["a fixed telco price", mobile.contractId, { monthlyInstallmentCent: 2000 }],
    ["an unknown option", gas.contractId, { tariffOption: "gold" }],
  ])("rejects %s with 422", async (_case, contractId, payload) => {
    const result = await patch(contractId, payload);
    expect(result.statusCode).toBe(422);
    expect(result.headers?.["content-type"]).toBe("application/problem+json");
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  it.each([{}, { monthlyInstallmentCent: "90" }, { status: "terminated" }])(
    "rejects %j with 400",
    async (payload) => {
      expect((await patch(electricity.contractId, payload)).statusCode).toBe(400);
    },
  );

  it("answers 409 if the contract changed concurrently", async () => {
    dbMock
      .on(PutCommand)
      .rejects(new ConditionalCheckFailedException({ message: "version", $metadata: {} }));
    const result = await patch(electricity.contractId, { monthlyInstallmentCent: 9000 });
    expect(result.statusCode).toBe(409);
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(0);
  });

  it("answers 500 without details when EventBridge rejects the event", async () => {
    ebMock
      .on(PutEventsCommand)
      .resolves({ FailedEntryCount: 1, Entries: [{ ErrorCode: "InternalFailure" }] });
    const result = await patch(electricity.contractId, { monthlyInstallmentCent: 9000 });
    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain("InternalFailure");
  });
});
