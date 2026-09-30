import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { S3Client } from "@aws-sdk/client-s3";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { apiEvent, vendedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApi } from "./app.js";
import { documentId } from "./model.js";
import { BUCKET, testService } from "./testing.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const ebMock = mockClient(EventBridgeClient);

const uuid = "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11";
const api = createApi(
  testService(
    () => new Date("2026-09-30T12:00:00.000Z"),
    () => uuid,
  ),
);
const id = documentId("2026-09-30T12:00:00.000Z", uuid);
const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "null");
const upload = (payload: unknown, claims?: Record<string, string>) =>
  api(apiEvent("POST /documents/upload-url", { body: payload, ...(claims ? { claims } : {}) }));

beforeEach(() => {
  dbMock.reset();
  s3Mock.reset();
  ebMock.reset();
  dbMock.on(GetCommand).resolves({});
  dbMock
    .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "DOCUMENTS" } })
    .resolves({ Item: { customerId: "c-1" } });
  dbMock.on(PutCommand).resolves({});
});

describe("GET /documents", () => {
  const stored = {
    documentId: id,
    fileName: "zaehler.jpg",
    contentType: "image/jpeg",
    category: "meter-photo",
    sizeBytes: 1000,
    status: "uploaded",
    createdAt: "2026-09-30T12:00:00.000Z",
    uploadedAt: "2026-09-30T12:00:05.000Z",
    expiresAt: "2026-10-07T12:00:00.000Z",
  };

  it("lists the caller's documents newest first without storage keys", async () => {
    dbMock
      .on(QueryCommand)
      .resolves({ Items: [{ PK: "TENANT#owner#CUST#c-1", SK: `DOC#${id}`, ...stored }] });
    const result = await api(apiEvent("GET /documents"));
    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({ items: [stored] });
    const input = dbMock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(input?.ExpressionAttributeValues).toEqual({
      ":pk": "TENANT#owner#CUST#c-1",
      ":doc": "DOC#",
    });
    expect(input?.ScanIndexForward).toBe(false);
  });

  it("returns an empty list for an identity the domain does not know yet", async () => {
    const result = await api(apiEvent("GET /documents", { claims: { sub: "sub-new" } }));
    expect(body(result)).toEqual({ items: [] });
  });
});

describe("POST /documents/upload-url", () => {
  it("registers a pending document and signs a PUT for exactly this type and size", async () => {
    const result = await upload({
      fileName: "zaehler.jpg",
      contentType: "image/jpeg",
      sizeBytes: 123456,
      category: "meter-photo",
    });

    expect(result.statusCode).toBe(201);
    const ticket = body(result);
    expect(ticket).toMatchObject({
      documentId: id,
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      expiresAt: "2026-09-30T12:05:00.000Z",
    });
    const url = new URL(ticket.uploadUrl);
    expect(url.host).toBe(`${BUCKET}.s3.eu-central-1.amazonaws.com`);
    expect(url.pathname).toBe(`/uploads/owner/c-1/${id}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect([...url.searchParams.keys()].some((key) => key.startsWith("x-amz-checksum"))).toBe(
      false,
    );

    expect(dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item).toEqual({
      PK: "TENANT#owner#CUST#c-1",
      SK: `DOC#${id}`,
      documentId: id,
      fileName: "zaehler.jpg",
      contentType: "image/jpeg",
      category: "meter-photo",
      sizeBytes: 123456,
      status: "pending",
      createdAt: "2026-09-30T12:00:00.000Z",
      expiresAt: "2026-10-07T12:00:00.000Z",
    });
  });

  it("defaults the category to other", async () => {
    await upload({ fileName: "brief.pdf", contentType: "application/pdf", sizeBytes: 10 });
    expect(dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item?.category).toBe("other");
  });

  it.each([
    ["a GIF", { fileName: "a.gif", contentType: "image/gif", sizeBytes: 10 }],
    ["more than 5 MB", { fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 5242881 }],
    ["an empty file", { fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 0 }],
    ["a path", { fileName: "../../a.pdf", contentType: "application/pdf", sizeBytes: 10 }],
    ["extra fields", { fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 1, key: "x" }],
  ])("rejects %s with 400", async (_case, payload) => {
    expect((await upload(payload)).statusCode).toBe(400);
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  it("answers 409 while the account is still being set up", async () => {
    const result = await upload(
      { fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 10 },
      { sub: "sub-new" },
    );
    expect(result.statusCode).toBe(409);
  });
});

describe("POST /documents/upload-url for a demo pass", () => {
  const PASS = "p4k7x2qa";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs with the pass's vended credentials and writes only to the pass's table", async () => {
    // The router's default quota guard reads the base table from the environment.
    vi.stubEnv("TABLE_NAME", "base-table");
    const { data, sessions } = vendedTenantData({
      baseTable: "base-table",
      s3Config: { region: "eu-central-1", requestChecksumCalculation: "WHEN_REQUIRED" },
    });
    const passApi = createApi(
      testService(
        () => new Date("2026-09-30T12:00:00.000Z"),
        () => uuid,
        data,
      ),
    );
    dbMock
      .on(GetCommand, { Key: { PK: "PLATFORM", SK: `TENANT#${PASS}` } })
      .resolves({ Item: { status: "active" } })
      .on(GetCommand, { Key: { PK: `TENANT#${PASS}#SUBJ#sub-1`, SK: "DOCUMENTS" } })
      .resolves({ Item: { customerId: "c-1" } });
    dbMock.on(UpdateCommand).resolves({});

    const result = await passApi(
      apiEvent("POST /documents/upload-url", {
        body: { fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 10 },
        claims: { tenant_id: PASS },
      }),
    );

    expect(result.statusCode).toBe(201);
    const url = new URL(body(result).uploadUrl);
    expect(url.pathname).toBe(`/uploads/${PASS}/c-1/${id}`);
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^ASIAP4K7X2QA\//);
    expect(url.searchParams.get("X-Amz-Security-Token")).toBe(`token-${PASS}`);
    expect(sessions).toEqual([PASS]);
    const tables = dbMock
      .commandCalls(GetCommand)
      .filter((call) => call.args[0].input.Key?.PK !== "PLATFORM")
      .map((call) => call.args[0].input.TableName);
    expect(tables).toEqual([`kp-tenant-${PASS}`]);
    expect(dbMock.commandCalls(PutCommand)[0]?.args[0].input.TableName).toBe(`kp-tenant-${PASS}`);
    // The call is counted in the base table, never in the pass's own table.
    expect(dbMock.commandCalls(UpdateCommand)[0]?.args[0].input).toMatchObject({
      TableName: "base-table",
      Key: { PK: `TENANT#${PASS}`, SK: "QUOTA#api" },
    });
  });
});
