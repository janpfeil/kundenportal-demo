import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { CustomerRegistered } from "@kundenportal/events";
import { apiEvent } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createHandler } from "./app.js";
import { CustomerEvents } from "./publisher.js";
import { CustomerRepository } from "./repository.js";
import { CustomerService } from "./service.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const ebMock = mockClient(EventBridgeClient);

const profile = {
  PK: "TENANT#owner#CUST#c-1",
  SK: "PROFILE",
  customerId: "c-1",
  email: "david@example.org",
  displayName: "David",
  locale: "de",
  origin: "registration",
  createdAt: "2026-09-29T12:00:00.000Z",
};

let ids: string[];
const handler = () =>
  createHandler(
    new CustomerService(
      new CustomerRepository(DynamoDBDocumentClient.from(new DynamoDBClient({})), "table"),
      new CustomerEvents(new EventBridgeClient({}), "bus"),
      { now: () => new Date("2026-09-29T12:00:00.000Z") },
      () => ids.shift() ?? "id-x",
    ),
  );

const claims = { email: "david@example.org", name: "David Neumann", locale: "en-GB" };
const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "null");

beforeEach(() => {
  dbMock.reset();
  ebMock.reset();
  ids = ["c-new", "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11"];
});

describe("GET /me", () => {
  it("returns an existing profile without publishing", async () => {
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "CUSTOMER" } })
      .resolves({ Item: { customerId: "c-1" } })
      .on(GetCommand, { Key: { PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" } })
      .resolves({ Item: profile });

    const result = await handler()(apiEvent("GET /me", { claims }));

    expect(result.statusCode).toBe(200);
    expect(body(result)).toMatchObject({ customerId: "c-1", displayName: "David" });
    expect(body(result)).not.toHaveProperty("PK");
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(0);
  });

  it("creates the customer on first access and publishes CustomerRegistered", async () => {
    dbMock.on(GetCommand).resolves({});
    dbMock.on(TransactWriteCommand).resolves({});
    ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });

    const result = await handler()(apiEvent("GET /me", { claims }));

    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({
      customerId: "c-new",
      email: "david@example.org",
      displayName: "David Neumann",
      locale: "en",
      origin: "registration",
      createdAt: "2026-09-29T12:00:00.000Z",
    });
    const writes = dbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems ?? [];
    expect(writes.map((item) => item.Put?.Item?.PK)).toEqual([
      "TENANT#owner#SUBJ#sub-1",
      "TENANT#owner#CUST#c-new",
    ]);

    const entry = ebMock.commandCalls(PutEventsCommand)[0]?.args[0].input.Entries?.[0];
    expect(entry).toMatchObject({
      EventBusName: "bus",
      Source: "kundenportal.customer",
      DetailType: "CustomerRegistered",
    });
    const detail = CustomerRegistered.detail.parse(JSON.parse(entry?.Detail ?? "{}"));
    expect(detail).toMatchObject({
      tenantId: "owner",
      correlationId: "req-1",
      payload: { customerId: "c-new", subject: "sub-1" },
    });
  });

  it("returns the winner's profile when a concurrent request created it first", async () => {
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "CUSTOMER" } })
      .resolvesOnce({})
      .resolves({ Item: { customerId: "c-1" } })
      .on(GetCommand, { Key: { PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" } })
      .resolves({ Item: profile });
    dbMock
      .on(TransactWriteCommand)
      .rejects(new TransactionCanceledException({ message: "taken", $metadata: {} }));

    const result = await handler()(apiEvent("GET /me", { claims }));

    expect(body(result)).toMatchObject({ customerId: "c-1" });
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(0);
  });

  it("rejects a first sign-in without email claim", async () => {
    dbMock.on(GetCommand).resolves({});
    expect((await handler()(apiEvent("GET /me"))).statusCode).toBe(403);
  });

  it("rejects tokens without tenant", async () => {
    expect((await handler()(apiEvent("GET /me", { claims: { tenant_id: "" } }))).statusCode).toBe(
      403,
    );
    expect(dbMock.calls()).toHaveLength(0);
  });

  it("answers 500 without details when EventBridge rejects the event", async () => {
    dbMock.on(GetCommand).resolves({});
    dbMock.on(TransactWriteCommand).resolves({});
    ebMock
      .on(PutEventsCommand)
      .resolves({ FailedEntryCount: 1, Entries: [{ ErrorCode: "InternalFailure" }] });
    const result = await handler()(apiEvent("GET /me", { claims }));
    expect(result.statusCode).toBe(500);
  });
});

describe("PATCH /me", () => {
  beforeEach(() => {
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "CUSTOMER" } })
      .resolves({ Item: { customerId: "c-1" } })
      .on(GetCommand, { Key: { PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" } })
      .resolves({ Item: profile });
  });

  it("updates editable fields only", async () => {
    dbMock.on(UpdateCommand).resolves({ Attributes: { ...profile, locale: "en" } });

    const result = await handler()(apiEvent("PATCH /me", { claims, body: { locale: "en" } }));

    expect(result.statusCode).toBe(200);
    expect(body(result)).toMatchObject({ locale: "en" });
    const input = dbMock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(input?.Key).toEqual({ PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" });
    expect(input?.UpdateExpression).toBe("SET #locale = :locale");
  });

  it.each([{}, { email: "evil@example.org" }, { displayName: "" }, { locale: "fr" }])(
    "rejects %j with 400",
    async (update) => {
      const result = await handler()(apiEvent("PATCH /me", { claims, body: update }));
      expect(result.statusCode).toBe(400);
      expect(dbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    },
  );

  it("fails if the profile disappears during the update", async () => {
    dbMock
      .on(UpdateCommand)
      .rejects(new ConditionalCheckFailedException({ message: "gone", $metadata: {} }));
    expect(
      (await handler()(apiEvent("PATCH /me", { claims, body: { displayName: "D" } }))).statusCode,
    ).toBe(500);
  });
});
