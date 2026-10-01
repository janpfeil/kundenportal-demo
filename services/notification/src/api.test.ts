import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { apiEvent, fixedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./api.js";
import { Mailbox, notificationId } from "./mailbox.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const api = createApi(new Mailbox(fixedTenantData()));

const id = notificationId("2026-09-29T12:00:00.000Z", "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11");
const note = {
  notificationId: id,
  kind: "welcome",
  title: "Willkommen",
  body: "Hallo",
  createdAt: "2026-09-29T12:00:00.000Z",
  read: false,
};
const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "null");

beforeEach(() => {
  dbMock.reset();
  dbMock.on(GetCommand).resolves({});
  dbMock
    .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "MAILBOX" } })
    .resolves({ Item: { customerId: "c-1" } });
});

describe("GET /notifications", () => {
  it("lists the caller's notes newest first without storage keys", async () => {
    dbMock
      .on(QueryCommand)
      .resolves({ Items: [{ PK: "TENANT#owner#CUST#c-1", SK: `NOTE#${id}`, ...note }] });

    const result = await api(apiEvent("GET /notifications"));

    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({ items: [note] });
    const input = dbMock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(input?.ExpressionAttributeValues?.[":pk"]).toBe("TENANT#owner#CUST#c-1");
    expect(input?.ScanIndexForward).toBe(false);
  });

  it("returns an empty mailbox before the welcome event arrived", async () => {
    const result = await api(apiEvent("GET /notifications", { claims: { sub: "sub-new" } }));
    expect(body(result)).toEqual({ items: [] });
    expect(dbMock.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it("scopes the lookup to the caller's tenant", async () => {
    await api(apiEvent("GET /notifications", { claims: { tenant_id: "other" } }));
    expect(dbMock.commandCalls(GetCommand)[0]?.args[0].input.Key?.PK).toBe(
      "TENANT#other#SUBJ#sub-1",
    );
  });
});

describe("PATCH /notifications/{notificationId}", () => {
  const patch = (notificationId: string, payload: unknown = { read: true }) =>
    api(
      apiEvent("PATCH /notifications/{notificationId}", {
        pathParameters: { notificationId },
        body: payload,
      }),
    );

  it("marks the caller's note as read", async () => {
    dbMock.on(UpdateCommand).resolves({});
    const result = await patch(id);
    expect(result.statusCode).toBe(204);
    expect(dbMock.commandCalls(UpdateCommand)[0]?.args[0].input.Key).toEqual({
      PK: "TENANT#owner#CUST#c-1",
      SK: `NOTE#${id}`,
    });
  });

  it("answers 404 for a note of someone else or a missing note", async () => {
    dbMock
      .on(UpdateCommand)
      .rejects(new ConditionalCheckFailedException({ message: "missing", $metadata: {} }));
    expect((await patch(id)).statusCode).toBe(404);
  });

  it("rejects malformed ids and bodies with 400", async () => {
    expect((await patch("../../x")).statusCode).toBe(400);
    expect((await patch(id, { read: false })).statusCode).toBe(400);
    expect(dbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });
});

describe("GET /admin/customers/{customerId}/notifications", () => {
  const PASS = "p4k7x2qa";
  const guarded: string[] = [];
  const admin = createApi(new Mailbox(fixedTenantData()), {
    tenantGuard: async (tenantId) => {
      guarded.push(tenantId);
    },
  });
  const read = (customerId: string, claims: Record<string, string>) =>
    admin(
      apiEvent("GET /admin/customers/{customerId}/notifications", {
        claims,
        pathParameters: { customerId },
      }),
    );

  beforeEach(() => {
    guarded.length = 0;
  });

  it("shows the owner a customer's mailbox newest first, read only", async () => {
    dbMock
      .on(QueryCommand)
      .resolves({ Items: [{ PK: "TENANT#owner#CUST#c-7", SK: `NOTE#${id}`, ...note }] });

    const result = await read("c-7", { "cognito:groups": "[owner]" });

    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({ items: [note] });
    const input = dbMock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(input?.ExpressionAttributeValues?.[":pk"]).toBe("TENANT#owner#CUST#c-7");
    expect(input?.ScanIndexForward).toBe(false);
    expect(dbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it("returns an empty mailbox of a known customer and 404 for an unknown one", async () => {
    dbMock.on(QueryCommand).resolves({ Items: [] });
    dbMock
      .on(GetCommand, { Key: { PK: `TENANT#${PASS}#CUST#c-7`, SK: "MAILBOX" } })
      .resolves({ Item: { locale: "de" } });
    const pass = { "cognito:groups": "[pass]", tenant_id: PASS };

    expect(body(await read("c-7", pass))).toEqual({ items: [] });
    // A customer of another tenant is unknown here: the key always carries the token's tenant.
    expect((await read("c-8", pass)).statusCode).toBe(404);
    expect(guarded).toEqual([PASS, PASS]);
  });

  it.each([
    ["a customer", {}],
    ["a pass holder in the owner tenant", { "cognito:groups": "[pass]" }],
  ])("refuses %s with 403", async (_who, claims) => {
    expect((await read("c-1", claims)).statusCode).toBe(403);
    expect(dbMock.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it("rejects a malformed customer id with 400", async () => {
    expect((await read("x".repeat(81), { "cognito:groups": "[owner]" })).statusCode).toBe(400);
  });
});
