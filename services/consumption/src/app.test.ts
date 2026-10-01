import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { MeterReadingSubmitted } from "@kundenportal/events";
import { apiEvent, fixedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.js";
import { ConsumptionEvents } from "./publisher.js";
import { ConsumptionRepository } from "./repository.js";
import { ConsumptionService } from "./service.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const ebMock = mockClient(EventBridgeClient);

let now = new Date("2026-09-30T12:00:00.000Z");
const ids = ["6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11", "7a2d2e75-9b5d-4d66-8b4a-6e9b5b1f3d22"];
let nextIds: string[];
const api = createApi(
  new ConsumptionService(
    new ConsumptionRepository(fixedTenantData()),
    new ConsumptionEvents(new EventBridgeClient({}), "bus"),
    { now: () => now },
    () => nextIds.shift() ?? "id-x",
  ),
);

const electricityId = "0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const mobileId = "1c7a4a8f-2d3e-4f60-9bac-1d2e3f4a5b6c";
const projection = {
  contractId: electricityId,
  customerId: "c-1",
  division: "electricity",
  meterNumber: "1EMH0012345678",
  unit: "kWh",
  status: "active",
  version: 1,
};
const latest = {
  readingId: "mfxyz0000-a",
  value: 18234,
  unit: "kWh",
  readAt: "2026-04-03",
  source: "contract-start",
  submittedAt: "2026-04-03T00:00:00.000Z",
};
const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "null");
const readingsEvent = (method: "GET" | "POST", contractId: string, payload?: unknown) =>
  apiEvent(`${method} /contracts/{contractId}/readings`, {
    pathParameters: { contractId },
    ...(payload === undefined ? {} : { body: payload }),
  });

beforeEach(() => {
  now = new Date("2026-09-30T12:00:00.000Z");
  nextIds = [...ids];
  dbMock.reset();
  ebMock.reset();
  dbMock.on(GetCommand).resolves({});
  dbMock
    .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "CONSUMPTION" } })
    .resolves({ Item: { customerId: "c-1" } })
    .on(GetCommand, { Key: { PK: `TENANT#owner#CONTRACT#${electricityId}`, SK: "CONSUMPTION" } })
    .resolves({ Item: projection })
    .on(GetCommand, { Key: { PK: `TENANT#owner#CONTRACT#${mobileId}`, SK: "CONSUMPTION" } })
    .resolves({
      Item: {
        contractId: mobileId,
        customerId: "c-1",
        division: "mobile",
        dataVolumeMb: 20480,
        status: "active",
        version: 1,
      },
    });
  dbMock.on(QueryCommand).resolves({ Items: [latest] });
  dbMock.on(PutCommand).resolves({});
  ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });
});

describe("GET /contracts/{contractId}/readings", () => {
  it("lists the readings of the caller's contract newest first", async () => {
    const result = await api(readingsEvent("GET", electricityId));
    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({ items: [latest] });
    const input = dbMock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(input?.ExpressionAttributeValues?.[":pk"]).toBe(
      `TENANT#owner#CONTRACT#${electricityId}`,
    );
    expect(input?.ScanIndexForward).toBe(false);
  });

  it("answers 404 for contracts of other customers, unknown contracts and unknown callers", async () => {
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-2", SK: "CONSUMPTION" } })
      .resolves({ Item: { customerId: "c-2" } });
    const other = apiEvent("GET /contracts/{contractId}/readings", {
      pathParameters: { contractId: electricityId },
      claims: { sub: "sub-2" },
    });
    expect((await api(other)).statusCode).toBe(404);
    expect(
      (await api(readingsEvent("GET", "2d8b5b90-3e4f-4a71-8cbd-2e3f4a5b6c7d"))).statusCode,
    ).toBe(404);
    const stranger = apiEvent("GET /contracts/{contractId}/readings", {
      pathParameters: { contractId: electricityId },
      claims: { sub: "sub-new" },
    });
    expect((await api(stranger)).statusCode).toBe(404);
    expect(dbMock.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it("rejects malformed contract ids with 400", async () => {
    expect((await api(readingsEvent("GET", "CONTRACT#x"))).statusCode).toBe(400);
  });
});

describe("POST /contracts/{contractId}/readings", () => {
  it("stores a plausible reading and publishes MeterReadingSubmitted", async () => {
    const result = await api(
      readingsEvent("POST", electricityId, { value: 19800.4, readAt: "2026-09-30" }),
    );

    expect(result.statusCode).toBe(201);
    expect(body(result)).toMatchObject({ value: 19800.4, unit: "kWh", source: "customer" });
    const item = dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item;
    expect(item?.PK).toBe(`TENANT#owner#CONTRACT#${electricityId}`);
    expect(item?.SK).toMatch(/^READING#2026-09-30#[0-9a-z]{9}-6f1c1f64-/);

    const entry = ebMock.commandCalls(PutEventsCommand)[0]?.args[0].input.Entries?.[0];
    expect(entry).toMatchObject({
      Source: "kundenportal.consumption",
      DetailType: "MeterReadingSubmitted",
    });
    expect(MeterReadingSubmitted.detail.parse(JSON.parse(entry?.Detail ?? "{}"))).toMatchObject({
      eventId: ids[1],
      correlationId: "req-1",
      payload: {
        customerId: "c-1",
        contractId: electricityId,
        division: "electricity",
        meterNumber: "1EMH0012345678",
        value: 19800.4,
      },
    });
  });

  it("accepts today's date in Germany shortly after midnight", async () => {
    now = new Date("2026-09-30T22:30:00.000Z"); // 00:30 on 1 October in Berlin
    const result = await api(
      readingsEvent("POST", electricityId, { value: 19800, readAt: "2026-10-01" }),
    );
    expect(result.statusCode).toBe(201);
  });

  it.each([
    ["a date in the future", { value: 19800, readAt: "2026-10-01" }, /future/],
    ["a value below the latest reading", { value: 18000, readAt: "2026-09-30" }, /below/],
    ["a date before the latest reading", { value: 19800, readAt: "2026-04-01" }, /before/],
  ])("rejects %s with 422", async (_case, payload, detail) => {
    const result = await api(readingsEvent("POST", electricityId, payload));
    expect(result.statusCode).toBe(422);
    expect(body(result).detail).toMatch(detail);
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(0);
  });

  it("rejects readings for contracts without meter with 422", async () => {
    const result = await api(readingsEvent("POST", mobileId, { value: 1, readAt: "2026-09-30" }));
    expect(result.statusCode).toBe(422);
  });

  it.each([{}, { value: -1, readAt: "2026-09-30" }, { value: 1, readAt: "30.09.2026" }])(
    "rejects %j with 400",
    async (payload) => {
      expect((await api(readingsEvent("POST", electricityId, payload))).statusCode).toBe(400);
    },
  );

  it("answers 500 without details when EventBridge rejects the event", async () => {
    ebMock
      .on(PutEventsCommand)
      .resolves({ FailedEntryCount: 1, Entries: [{ ErrorCode: "InternalFailure" }] });
    const result = await api(
      readingsEvent("POST", electricityId, { value: 19800, readAt: "2026-09-30" }),
    );
    expect(result.statusCode).toBe(500);
  });
});

describe("GET /contracts/{contractId}/usage", () => {
  const usage = (contractId: string) =>
    api(apiEvent("GET /contracts/{contractId}/usage", { pathParameters: { contractId } }));

  it("returns the demo data volume of a mobile contract", async () => {
    now = new Date("2026-09-16T00:00:00.000Z"); // exactly half of September
    const result = await usage(mobileId);
    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({
      contractId: mobileId,
      month: "2026-09",
      includedMb: 20480,
      usedMb: 14336,
      usedPercent: 70,
      thresholdPercent: 80,
      asOf: "2026-09-16T00:00:00.000Z",
    });
  });

  it("rejects contracts without data volume with 422", async () => {
    expect((await usage(electricityId)).statusCode).toBe(422);
  });
});

describe("GET /contracts/{contractId}/consumption", () => {
  const history = (contractId: string, sub = "sub-1") =>
    api(
      apiEvent("GET /contracts/{contractId}/consumption", {
        pathParameters: { contractId },
        claims: { sub },
      }),
    );

  it("aggregates the readings of the caller's contract into 12 months", async () => {
    now = new Date("2026-10-01T06:00:00.000Z");
    const result = await history(electricityId);

    expect(result.statusCode).toBe(200);
    const answer = body(result);
    expect(answer).toMatchObject({
      contractId: electricityId,
      unit: "kWh",
      latestReading: latest,
      // Due three months after 2026-04-03, long passed: within the next 14 days.
      nextReadingDue: "2026-10-15",
      readingDue: true,
      changePercent: 0,
    });
    expect(answer.months.map((m: { month: string }) => m.month)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    // Only the start reading and a projection from before phase 6: the default 2 500 kWh.
    expect(answer.total).toBeGreaterThanOrEqual(2494);
    expect(answer.total).toBeLessThanOrEqual(2506);
    expect(answer.plausibleRange.at).toBe("2026-10-01");

    // One page of readings, newest first, of the caller's contract.
    const queries = dbMock.commandCalls(QueryCommand);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.args[0].input).toMatchObject({
      ExpressionAttributeValues: { ":pk": `TENANT#owner#CONTRACT#${electricityId}` },
      ScanIndexForward: false,
      Limit: 100,
    });
  });

  it("estimates with the annual consumption of the projection", async () => {
    dbMock
      .on(GetCommand, { Key: { PK: `TENANT#owner#CONTRACT#${electricityId}`, SK: "CONSUMPTION" } })
      .resolves({ Item: { ...projection, estimatedAnnualConsumption: 3600 } });
    const answer = body(await history(electricityId));
    expect(answer.total).toBeGreaterThanOrEqual(3594);
    expect(answer.total).toBeLessThanOrEqual(3606);
  });

  it("rejects contracts without a meter with 422", async () => {
    expect((await history(mobileId)).statusCode).toBe(422);
    expect(dbMock.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it("answers 404 for contracts of other customers and unknown contracts", async () => {
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-2", SK: "CONSUMPTION" } })
      .resolves({ Item: { customerId: "c-2" } });
    expect((await history(electricityId, "sub-2")).statusCode).toBe(404);
    expect((await history("2d8b5b90-3e4f-4a71-8cbd-2e3f4a5b6c7d")).statusCode).toBe(404);
    expect(dbMock.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it("rejects malformed contract ids with 400", async () => {
    expect((await history("CONTRACT#x")).statusCode).toBe(400);
  });
});
