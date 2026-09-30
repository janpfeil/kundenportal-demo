import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DocumentUploaded } from "@kundenportal/events";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { documentId } from "./model.js";
import { BUCKET, testService } from "./testing.js";
import { createWorker } from "./worker.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const ebMock = mockClient(EventBridgeClient);

const worker = createWorker(
  testService(
    () => new Date("2026-09-30T12:00:05.000Z"),
    () => "x",
  ),
);
const id = documentId("2026-09-30T12:00:00.000Z", "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11");
const key = `uploads/owner/c-1/${id}`;
const pending = {
  documentId: id,
  fileName: "zaehler.jpg",
  contentType: "image/jpeg",
  category: "meter-photo",
  sizeBytes: 123456,
  status: "pending",
  createdAt: "2026-09-30T12:00:00.000Z",
  expiresAt: "2026-10-07T12:00:00.000Z",
};
const objectCreated = (objectKey = key, size = 123456, bucket = BUCKET) => ({
  version: "0",
  id: "s3-event-1",
  source: "aws.s3",
  "detail-type": "Object Created",
  detail: { bucket: { name: bucket }, object: { key: objectKey, size, etag: "e" } },
});
const published = () =>
  ebMock
    .commandCalls(PutEventsCommand)
    .map((call) => JSON.parse(call.args[0].input.Entries?.[0]?.Detail ?? "{}"));

beforeEach(() => {
  dbMock.reset();
  s3Mock.reset();
  ebMock.reset();
  dbMock.on(GetCommand).resolves({});
  dbMock
    .on(GetCommand, { Key: { PK: "TENANT#owner#CUST#c-1", SK: `DOC#${id}` } })
    .resolves({ Item: pending });
  dbMock.on(PutCommand).resolves({});
  s3Mock.on(DeleteObjectCommand).resolves({});
  ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });
});

describe("S3 Object Created", () => {
  it("marks an announced upload as uploaded and publishes DocumentUploaded", async () => {
    await worker(objectCreated());

    expect(dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item).toMatchObject({
      PK: "TENANT#owner#CUST#c-1",
      SK: `DOC#${id}`,
      status: "uploaded",
      uploadedAt: "2026-09-30T12:00:05.000Z",
    });
    const entry = ebMock.commandCalls(PutEventsCommand)[0]?.args[0].input.Entries?.[0];
    expect(entry).toMatchObject({
      Source: "kundenportal.documents",
      DetailType: "DocumentUploaded",
    });
    expect(DocumentUploaded.detail.parse(JSON.parse(entry?.Detail ?? "{}"))).toMatchObject({
      tenantId: "owner",
      correlationId: "s3-event-1",
      payload: { customerId: "c-1", documentId: id, fileName: "zaehler.jpg", sizeBytes: 123456 },
    });
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
  });

  it("re-publishes the same event id for a repeated S3 event without writing again", async () => {
    await worker(objectCreated());
    const first = published()[0]?.eventId;
    dbMock.on(GetCommand, { Key: { PK: "TENANT#owner#CUST#c-1", SK: `DOC#${id}` } }).resolves({
      Item: { ...pending, status: "uploaded", uploadedAt: "2026-09-30T12:00:05.000Z" },
    });
    dbMock.resetHistory();

    await worker(objectCreated());

    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
    expect(published().map((d) => d.eventId)).toEqual([first, first]);
  });

  it("deletes and rejects a file whose size differs from the announcement", async () => {
    await worker(objectCreated(key, 999));
    expect(s3Mock.commandCalls(DeleteObjectCommand)[0]?.args[0].input).toEqual({
      Bucket: BUCKET,
      Key: key,
    });
    expect(dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item?.status).toBe("rejected");
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(0);
  });

  it.each([
    [
      "an unannounced document",
      `uploads/owner/c-1/${documentId("2026-09-30T00:00:00Z", "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c12")}`,
    ],
    ["a key outside the upload layout", "somewhere/else.jpg"],
  ])("deletes %s", async (_case, objectKey) => {
    await worker(objectCreated(objectKey));
    expect(s3Mock.commandCalls(DeleteObjectCommand)[0]?.args[0].input.Key).toBe(objectKey);
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(0);
  });

  it("ignores events of other buckets", async () => {
    await worker(objectCreated(key, 123456, "other-bucket"));
    expect(dbMock.calls()).toHaveLength(0);
    expect(s3Mock.calls()).toHaveLength(0);
  });

  it("throws on infrastructure errors so Lambda retries", async () => {
    ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 1, Entries: [{ ErrorCode: "X" }] });
    await expect(worker(objectCreated())).rejects.toThrow(/rejected/);
  });
});

describe("CustomerRegistered", () => {
  it("links the identity to the customer in the own projection", async () => {
    await worker({
      source: "kundenportal.customer",
      "detail-type": "CustomerRegistered",
      detail: {
        eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
        tenantId: "owner",
        occurredAt: "2026-09-30T12:00:00.000Z",
        correlationId: "req-1",
        payload: {
          customerId: "c-1",
          subject: "sub-1",
          email: "anna@example.org",
          displayName: "Anna",
          locale: "de",
          origin: "registration",
        },
      },
    });
    expect(dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item).toEqual({
      PK: "TENANT#owner#SUBJ#sub-1",
      SK: "DOCUMENTS",
      customerId: "c-1",
    });
  });

  it.each([
    ["no envelope", { hello: "world" }],
    [
      "an invalid event",
      { source: "kundenportal.customer", "detail-type": "CustomerRegistered", detail: {} },
    ],
    ["an invalid S3 event", { source: "aws.s3", "detail-type": "Object Created", detail: {} }],
    ["an unknown type", { source: "kundenportal.customer", "detail-type": "Unknown", detail: {} }],
  ])("throws for %s so it ends up in the DLQ", async (_case, input) => {
    await expect(worker(input)).rejects.toThrow();
  });
});
