import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { apiEvent } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.js";
import { documentId } from "./model.js";
import { testService } from "./testing.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

const PASS = "p4k7x2qa";
const uuid = "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11";
const guarded: string[] = [];
const api = createApi(
  testService(
    () => new Date("2026-10-02T12:00:00.000Z"),
    () => uuid,
  ),
  {
    tenantGuard: async (tenantId) => {
      guarded.push(tenantId);
    },
  },
);
const stored = {
  documentId: documentId("2026-09-30T12:00:00.000Z", uuid),
  fileName: "zaehler.jpg",
  contentType: "image/jpeg",
  category: "meter-photo",
  sizeBytes: 1000,
  status: "uploaded",
  createdAt: "2026-09-30T12:00:00.000Z",
  uploadedAt: "2026-09-30T12:00:05.000Z",
  expiresAt: "2026-10-07T12:00:00.000Z",
};
const read = (customerId: string, claims: Record<string, string>) =>
  api(
    apiEvent("GET /admin/customers/{customerId}/documents", {
      claims,
      pathParameters: { customerId },
    }),
  );
const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "null");

beforeEach(() => {
  dbMock.reset();
  s3Mock.reset();
  guarded.length = 0;
});

describe("GET /admin/customers/{customerId}/documents", () => {
  it("shows the owner a customer's document metadata newest first, without keys or links", async () => {
    dbMock.on(QueryCommand).resolves({
      Items: [{ PK: "TENANT#owner#CUST#c-7", SK: `DOC#${stored.documentId}`, ...stored }],
    });

    const result = await read("c-7", { "cognito:groups": "[owner]" });

    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({ items: [stored] });
    const input = dbMock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(input?.ExpressionAttributeValues).toEqual({
      ":pk": "TENANT#owner#CUST#c-7",
      ":doc": "DOC#",
    });
    expect(input?.ScanIndexForward).toBe(false);
    expect(s3Mock.calls()).toHaveLength(0);
  });

  it("reads only the pass holder's own tenant", async () => {
    dbMock.on(QueryCommand).resolves({ Items: [] });
    const result = await read("c-7", { "cognito:groups": "[pass]", tenant_id: PASS });
    expect(body(result)).toEqual({ items: [] });
    expect(
      dbMock.commandCalls(QueryCommand)[0]?.args[0].input.ExpressionAttributeValues?.[":pk"],
    ).toBe(`TENANT#${PASS}#CUST#c-7`);
    expect(guarded).toEqual([PASS]);
  });

  it.each([
    ["a customer", {}],
    ["a pass holder in the owner tenant", { "cognito:groups": "[pass]" }],
  ])("refuses %s with 403", async (_who, claims) => {
    expect((await read("c-7", claims)).statusCode).toBe(403);
    expect(dbMock.calls()).toHaveLength(0);
  });

  it("rejects a malformed customer id with 400", async () => {
    expect((await read("x".repeat(81), { "cognito:groups": "[owner]" })).statusCode).toBe(400);
  });
});
