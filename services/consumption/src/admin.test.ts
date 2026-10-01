import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { apiEvent, fixedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.js";
import { ConsumptionEvents } from "./publisher.js";
import { ConsumptionRepository } from "./repository.js";
import { ConsumptionService } from "./service.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const ebMock = mockClient(EventBridgeClient);

const PASS = "p4k7x2qa";
const contractId = "0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const guarded: string[] = [];
const api = createApi(
  new ConsumptionService(
    new ConsumptionRepository(fixedTenantData()),
    new ConsumptionEvents(new EventBridgeClient({}), "bus"),
    { now: () => new Date("2026-10-02T10:00:00.000Z") },
    () => "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  ),
  {
    tenantGuard: async (tenantId) => {
      guarded.push(tenantId);
    },
  },
);
const projection = (tenant: string, extra: Record<string, unknown> = {}) => ({
  PK: `TENANT#${tenant}#CONTRACT#${contractId}`,
  SK: "CONSUMPTION",
  contractId,
  customerId: "c-1",
  division: "electricity",
  meterNumber: "1EMH0012345678",
  unit: "kWh",
  status: "active",
  version: 3,
  ...extra,
});
const reading = {
  readingId: "mfxyz0000-a",
  value: 18234,
  unit: "kWh",
  readAt: "2026-04-03",
  source: "contract-start",
  submittedAt: "2026-04-03T00:00:00.000Z",
};
const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "null");
const OWNER = { "cognito:groups": "[owner]" };

beforeEach(() => {
  dbMock.reset();
  ebMock.reset();
  guarded.length = 0;
  dbMock.on(GetCommand).resolves({});
  dbMock.on(QueryCommand).resolves({ Items: [reading] });
});

describe("GET /admin/contracts/{contractId}/readings", () => {
  const read = (claims: Record<string, string>, id = contractId) =>
    api(
      apiEvent("GET /admin/contracts/{contractId}/readings", {
        claims,
        pathParameters: { contractId: id },
      }),
    );

  it("shows the owner the readings of any contract of the tenant, newest first", async () => {
    dbMock
      .on(GetCommand, { Key: { PK: `TENANT#owner#CONTRACT#${contractId}`, SK: "CONSUMPTION" } })
      .resolves({ Item: projection("owner", { customerId: "someone-else" }) });

    const result = await read(OWNER);

    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({ items: [reading] });
    const input = dbMock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(input?.ExpressionAttributeValues?.[":pk"]).toBe(`TENANT#owner#CONTRACT#${contractId}`);
    expect(input?.ScanIndexForward).toBe(false);
    // No identity lookup: the operator is not the contract's customer.
    expect(dbMock.commandCalls(GetCommand)).toHaveLength(1);
  });

  it("answers 404 for a contract that is not in the caller's tenant", async () => {
    dbMock
      .on(GetCommand, { Key: { PK: `TENANT#owner#CONTRACT#${contractId}`, SK: "CONSUMPTION" } })
      .resolves({ Item: projection("owner") });

    const result = await read({ "cognito:groups": "[pass]", tenant_id: PASS });

    expect(result.statusCode).toBe(404);
    expect(dbMock.commandCalls(GetCommand)[0]?.args[0].input.Key).toEqual({
      PK: `TENANT#${PASS}#CONTRACT#${contractId}`,
      SK: "CONSUMPTION",
    });
    expect(dbMock.commandCalls(QueryCommand)).toHaveLength(0);
    expect(guarded).toEqual([PASS]);
  });

  it.each([
    ["a customer", {}],
    ["a pass holder in the owner tenant", { "cognito:groups": "[pass]" }],
  ])("refuses %s with 403", async (_who, claims) => {
    expect((await read(claims)).statusCode).toBe(403);
    expect(dbMock.calls()).toHaveLength(0);
  });

  it("rejects a malformed contract id with 400", async () => {
    expect((await read(OWNER, "nope")).statusCode).toBe(400);
  });
});

describe("POST /contracts/{contractId}/readings after a termination", () => {
  const submit = (readAt: string) =>
    api(
      apiEvent("POST /contracts/{contractId}/readings", {
        pathParameters: { contractId },
        body: { value: 19000, readAt },
      }),
    );
  const withContract = (extra: Record<string, unknown>) =>
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "CONSUMPTION" } })
      .resolves({ Item: { customerId: "c-1" } })
      .on(GetCommand, { Key: { PK: `TENANT#owner#CONTRACT#${contractId}`, SK: "CONSUMPTION" } })
      .resolves({ Item: projection("owner", extra) });
  const end = (kind: string, effectiveDate: string) => ({ termination: { kind, effectiveDate } });

  beforeEach(() => {
    dbMock.on(PutCommand).resolves({});
    ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });
  });

  it("takes the final reading up to the last day, also entered after it", async () => {
    withContract(end("termination", "2026-09-30"));
    expect((await submit("2026-09-30")).statusCode).toBe(201);
  });

  it("refuses a reading dated after the last day with 422", async () => {
    withContract(end("termination", "2026-09-30"));
    const result = await submit("2026-10-01");
    expect(result.statusCode).toBe(422);
    expect(body(result).detail).toContain("after the end of the contract");
  });

  it.each([
    ["a withdrawn contract", end("withdrawal", "2026-09-20")],
    ["a terminated contract", { status: "terminated" }],
  ])("refuses readings for %s with 422", async (_name, extra) => {
    withContract(extra);
    expect((await submit("2026-09-15")).statusCode).toBe(422);
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
  });
});
