import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { apiEvent, fixedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createHandler } from "./app.js";
import { CustomerEvents } from "./publisher.js";
import { CustomerRepository } from "./repository.js";
import { CustomerService } from "./service.js";
import { createWorker } from "./worker.js";

const dbMock = mockClient(DynamoDBDocumentClient);

// 2026-10-02 in Germany.
const service = () =>
  new CustomerService(
    new CustomerRepository(fixedTenantData()),
    new CustomerEvents(new EventBridgeClient({}), "bus"),
    { now: () => new Date("2026-10-02T08:00:00.000Z") },
  );
const guarded: string[] = [];
const handler = () =>
  createHandler(service(), {
    tenantGuard: async (tenantId) => {
      guarded.push(tenantId);
    },
  });

const OWNER = { "cognito:groups": "[owner]" };
const PASS = "p4k7x2qa";
const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "null");

const K1 = "0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const K2 = "1c7a4a8f-2d3e-4f60-9bac-1d2e3f4a5b6c";

const directoryItems = (tenant: string): Record<string, unknown>[] => [
  {
    PK: `TENANT#${tenant}#CUSTOMERS`,
    SK: "CUST#c-1",
    customerId: "c-1",
    displayName: "Anna Becker",
    email: "anna.becker@example.org",
    origin: "legacy-utility",
    createdAt: "2026-09-01T10:00:00.000Z",
    locale: "de",
    legacyAccounts: ["utility:V-1000123"],
    rev: 2,
  },
  {
    PK: `TENANT#${tenant}#CUSTOMERS`,
    SK: `CUST#c-1#C#${K1}`,
    customerId: "c-1",
    contractId: K1,
    division: "electricity",
    status: "active",
    startDate: "2026-01-01",
    version: 3,
    termination: { kind: "termination", effectiveDate: "2026-12-31" },
  },
  {
    PK: `TENANT#${tenant}#CUSTOMERS`,
    SK: "CUST#c-2",
    customerId: "c-2",
    displayName: "David Neumann",
    email: "david@example.org",
    origin: "registration",
    createdAt: "2026-09-29T12:00:00.000Z",
    rev: 1,
  },
  // A contract whose customer has no summary yet (event before profile): not listed.
  {
    PK: `TENANT#${tenant}#CUSTOMERS`,
    SK: `CUST#c-9#C#${K2}`,
    customerId: "c-9",
    contractId: K2,
    division: "gas",
    status: "active",
    startDate: "2026-02-01",
    version: 1,
  },
];

beforeEach(() => {
  dbMock.reset();
  guarded.length = 0;
});

describe("GET /admin/customers", () => {
  it("reads the operator's directory partition once and returns summaries", async () => {
    dbMock.on(QueryCommand).resolves({ Items: directoryItems("owner") });

    const result = await handler()(apiEvent("GET /admin/customers", { claims: OWNER }));

    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({
      total: 2,
      items: [
        {
          customerId: "c-2",
          displayName: "David Neumann",
          email: "david@example.org",
          origin: "registration",
          createdAt: "2026-09-29T12:00:00.000Z",
          divisions: [],
          contracts: { active: 0, pendingTermination: 0, terminated: 0 },
        },
        {
          customerId: "c-1",
          displayName: "Anna Becker",
          email: "anna.becker@example.org",
          origin: "legacy-utility",
          createdAt: "2026-09-01T10:00:00.000Z",
          locale: "de",
          legacyAccounts: ["utility:V-1000123"],
          divisions: ["electricity"],
          contracts: { active: 0, pendingTermination: 1, terminated: 0 },
        },
      ],
    });
    const queries = dbMock.commandCalls(QueryCommand);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.args[0].input).toMatchObject({
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": "TENANT#owner#CUSTOMERS" },
    });
  });

  it("follows DynamoDB's pages and applies filters and limit", async () => {
    const items = directoryItems("owner");
    dbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: items.slice(0, 2), LastEvaluatedKey: { PK: "x", SK: "y" } })
      .resolves({ Items: items.slice(2) });

    const result = await handler()(
      apiEvent("GET /admin/customers", {
        claims: OWNER,
        query: { contracts: "pending-termination", limit: "1" },
      }),
    );

    expect(body(result)).toMatchObject({ total: 1, items: [{ customerId: "c-1" }] });
    expect(dbMock.commandCalls(QueryCommand)).toHaveLength(2);
  });

  it("lets the holder of a pass operate the own pass tenant only", async () => {
    dbMock.on(QueryCommand).resolves({ Items: directoryItems(PASS) });
    const result = await handler()(
      apiEvent("GET /admin/customers", {
        claims: { "cognito:groups": "[pass]", tenant_id: PASS },
      }),
    );
    expect(result.statusCode).toBe(200);
    expect(guarded).toEqual([PASS]);
    expect(dbMock.commandCalls(QueryCommand)[0]?.args[0].input.ExpressionAttributeValues).toEqual({
      ":pk": `TENANT#${PASS}#CUSTOMERS`,
    });
  });

  it.each([
    ["a customer", {}],
    ["a pass holder in the owner tenant", { "cognito:groups": "[pass]" }],
    ["a customer of a pass tenant", { tenant_id: PASS }],
  ])("refuses %s with 403 before reading anything", async (_who, claims) => {
    const result = await handler()(apiEvent("GET /admin/customers", { claims }));
    expect(result.statusCode).toBe(403);
    expect(dbMock.calls()).toHaveLength(0);
  });

  it("rejects invalid parameters with 400", async () => {
    const result = await handler()(
      apiEvent("GET /admin/customers", { claims: OWNER, query: { limit: "500" } }),
    );
    expect(result.statusCode).toBe(400);
    expect(dbMock.calls()).toHaveLength(0);
  });
});

describe("GET /admin/customers/{customerId}", () => {
  const get = (customerId: string, claims: Record<string, string> = OWNER) =>
    handler()(
      apiEvent("GET /admin/customers/{customerId}", { claims, pathParameters: { customerId } }),
    );

  it("returns the profile with its contract summaries", async () => {
    dbMock.on(GetCommand, { Key: { PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" } }).resolves({
      Item: {
        PK: "TENANT#owner#CUST#c-1",
        SK: "PROFILE",
        customerId: "c-1",
        displayName: "Anna Becker",
        email: "anna.becker@example.org",
        origin: "legacy-utility",
        createdAt: "2026-09-01T10:00:00.000Z",
        locale: "de",
        phone: "0341 2345678",
        legacyAccounts: new Set(["utility:V-1000123"]),
        rev: 2,
        listed: true,
      },
    });
    dbMock.on(QueryCommand).resolves({ Items: directoryItems("owner").slice(1, 2) });

    const result = await get("c-1");

    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({
      customerId: "c-1",
      displayName: "Anna Becker",
      email: "anna.becker@example.org",
      origin: "legacy-utility",
      createdAt: "2026-09-01T10:00:00.000Z",
      locale: "de",
      phone: "0341 2345678",
      legacyAccounts: ["utility:V-1000123"],
      divisions: ["electricity"],
      contracts: { active: 0, pendingTermination: 1, terminated: 0 },
    });
    expect(dbMock.commandCalls(QueryCommand)[0]?.args[0].input.ExpressionAttributeValues).toEqual({
      ":pk": "TENANT#owner#CUSTOMERS",
      ":prefix": "CUST#c-1#C#",
    });
  });

  it("answers 404 for a customer of another tenant: the lookup stays in the token's tenant", async () => {
    dbMock.on(GetCommand).resolves({});
    dbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await get("c-1", { "cognito:groups": "[pass]", tenant_id: PASS });

    expect(result.statusCode).toBe(404);
    expect(dbMock.commandCalls(GetCommand)[0]?.args[0].input.Key).toEqual({
      PK: `TENANT#${PASS}#CUST#c-1`,
      SK: "PROFILE",
    });
  });

  it("refuses customers with 403 and malformed ids with 400", async () => {
    expect((await get("c-1", {})).statusCode).toBe(403);
    expect((await get("x".repeat(81))).statusCode).toBe(400);
    expect(dbMock.calls()).toHaveLength(0);
  });
});

describe("ContractChanged → customer directory", () => {
  const changed = (version: number, contract: Record<string, unknown> = {}) => ({
    source: "kundenportal.contract",
    "detail-type": "ContractChanged",
    detail: {
      eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
      tenantId: "owner",
      occurredAt: "2026-10-02T08:00:00.000Z",
      correlationId: "c",
      payload: {
        changeType: version === 1 ? "created" : "updated",
        changes: version === 1 ? [] : ["termination"],
        initiatedBy: "customer",
        contract: {
          contractId: K1,
          customerId: "c-7",
          division: "electricity",
          tariffName: "Strom Klassik",
          tariffOption: "oeko",
          monthlyInstallmentCent: 9000,
          meterNumber: "1EMH0012345678",
          unit: "kWh",
          startDate: "2026-10-15",
          status: "active",
          version,
          productId: "strom-klassik",
          productVersion: 1,
          ...contract,
        },
      },
    },
  });

  it("keeps a small summary per contract, even before the customer's profile", async () => {
    dbMock.on(PutCommand).resolves({});
    await createWorker(service())(
      changed(2, {
        termination: {
          kind: "termination",
          effectiveDate: "2027-10-14",
          requestedAt: "2026-10-02T08:00:00.000Z",
          by: "customer",
        },
      }),
    );

    const put = dbMock.commandCalls(PutCommand)[0]?.args[0].input;
    expect(put?.Item).toEqual({
      PK: "TENANT#owner#CUSTOMERS",
      SK: `CUST#c-7#C#${K1}`,
      customerId: "c-7",
      contractId: K1,
      division: "electricity",
      status: "active",
      startDate: "2026-10-15",
      version: 2,
      productId: "strom-klassik",
      productVersion: 1,
      termination: { kind: "termination", effectiveDate: "2027-10-14" },
    });
    expect(put?.ConditionExpression).toBe("attribute_not_exists(PK) OR #version < :version");
    expect(put?.ExpressionAttributeValues).toEqual({ ":version": 2 });
    // No read of the profile: the summary does not depend on it.
    expect(dbMock.commandCalls(GetCommand)).toHaveLength(0);
  });

  it("ignores an older snapshot that arrives after a newer one", async () => {
    dbMock
      .on(PutCommand)
      .resolvesOnce({})
      .rejects(new ConditionalCheckFailedException({ message: "newer", $metadata: {} }));
    const worker = createWorker(service());
    await worker(changed(2));
    await expect(worker(changed(1))).resolves.toBeUndefined();
    expect(dbMock.commandCalls(PutCommand).map((c) => c.args[0].input.Item?.version)).toEqual([
      2, 1,
    ]);
  });

  it("sends an invalid event to the DLQ", async () => {
    await expect(createWorker(service())(changed(0))).rejects.toThrow("Invalid ContractChanged");
  });
});
