import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { CustomerRegistered } from "@kundenportal/events";
import { apiEvent, fixedTenantData } from "@kundenportal/service-kit/testing";
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
  rev: 3,
  listed: true,
  announced: true,
};

let ids: string[];
const handler = () =>
  createHandler(
    new CustomerService(
      new CustomerRepository(fixedTenantData()),
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
    expect(body(result)).not.toHaveProperty("rev");
    expect(body(result)).not.toHaveProperty("listed");
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(0);
    // Already in the directory: a read writes nothing.
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
    expect(dbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it("adds a profile from before phase 7 to the directory once (backfill)", async () => {
    const { rev: _rev, listed: _listed, ...old } = profile;
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "CUSTOMER" } })
      .resolves({ Item: { customerId: "c-1" } })
      .on(GetCommand, { Key: { PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" } })
      .resolves({ Item: old });
    dbMock.on(PutCommand).resolves({});
    dbMock.on(UpdateCommand).resolves({});

    const result = await handler()(apiEvent("GET /me", { claims }));

    expect(result.statusCode).toBe(200);
    const put = dbMock.commandCalls(PutCommand)[0]?.args[0].input;
    expect(put?.Item).toMatchObject({
      PK: "TENANT#owner#CUSTOMERS",
      SK: "CUST#c-1",
      displayName: "David",
      rev: 0,
    });
    expect(put?.ConditionExpression).toBe("attribute_not_exists(PK) OR #rev < :rev");
    const mark = dbMock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(mark?.Key).toEqual({ PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" });
    expect(mark?.UpdateExpression).toBe("SET #listed = :true");
  });

  it("still answers when the backfill fails; the next read tries again", async () => {
    const { listed: _listed, ...old } = profile;
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "CUSTOMER" } })
      .resolves({ Item: { customerId: "c-1" } })
      .on(GetCommand, { Key: { PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" } })
      .resolves({ Item: old });
    dbMock.on(PutCommand).rejects(new Error("throttled"));

    const result = await handler()(apiEvent("GET /me", { claims }));

    expect(result.statusCode).toBe(200);
    expect(dbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it("repeats CustomerRegistered once for a profile from before the marker", async () => {
    const { announced: _announced, ...old } = profile;
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "CUSTOMER" } })
      .resolves({ Item: { customerId: "c-1" } })
      .on(GetCommand, { Key: { PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" } })
      .resolves({ Item: old });
    dbMock.on(UpdateCommand).resolves({});
    ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });

    const result = await handler()(apiEvent("GET /me", { claims }));

    expect(result.statusCode).toBe(200);
    const entries = ebMock.commandCalls(PutEventsCommand).flatMap((c) => c.args[0].input.Entries);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.DetailType).toBe("CustomerRegistered");
    const detail = CustomerRegistered.detail.parse(JSON.parse(entries[0]?.Detail ?? "{}"));
    expect(detail).toMatchObject({
      tenantId: "owner",
      correlationId: "req-1",
      payload: {
        customerId: "c-1",
        subject: "sub-1",
        email: "david@example.org",
        displayName: "David",
        locale: "de",
        origin: "registration",
      },
    });
    // The same id on every repetition, so a race of two reads announces nothing twice.
    expect(detail.eventId).toMatch(/^[0-9a-f-]{36}$/);
    const mark = dbMock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(mark?.Key).toEqual({ PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" });
    expect(mark?.UpdateExpression).toBe("SET #announced = :true");
  });

  it("still answers when the announcement fails and leaves the profile unmarked", async () => {
    const { announced: _announced, ...old } = profile;
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "CUSTOMER" } })
      .resolves({ Item: { customerId: "c-1" } })
      .on(GetCommand, { Key: { PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" } })
      .resolves({ Item: old });
    ebMock
      .on(PutEventsCommand)
      .resolves({ FailedEntryCount: 1, Entries: [{ ErrorCode: "InternalFailure" }] });

    const result = await handler()(apiEvent("GET /me", { claims }));

    expect(result.statusCode).toBe(200);
    expect(body(result)).toMatchObject({ customerId: "c-1" });
    expect(dbMock.commandCalls(UpdateCommand)).toHaveLength(0);
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
      "TENANT#owner#CUSTOMERS",
    ]);
    expect(writes[1]?.Put?.Item).toMatchObject({ rev: 1, listed: true, announced: true });
    expect(writes[2]?.Put?.Item).toEqual({
      PK: "TENANT#owner#CUSTOMERS",
      SK: "CUST#c-new",
      customerId: "c-new",
      email: "david@example.org",
      displayName: "David Neumann",
      locale: "en",
      origin: "registration",
      createdAt: "2026-09-29T12:00:00.000Z",
      rev: 1,
    });

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

  it("updates editable fields only and refreshes the directory's summary", async () => {
    dbMock.on(UpdateCommand).resolves({ Attributes: { ...profile, locale: "en", rev: 4 } });
    dbMock.on(PutCommand).resolves({});

    const result = await handler()(apiEvent("PATCH /me", { claims, body: { locale: "en" } }));

    expect(result.statusCode).toBe(200);
    expect(body(result)).toMatchObject({ locale: "en" });
    expect(body(result)).not.toHaveProperty("rev");
    const input = dbMock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(input?.Key).toEqual({ PK: "TENANT#owner#CUST#c-1", SK: "PROFILE" });
    expect(input?.UpdateExpression).toBe("SET #locale = :locale, #listed = :true ADD #rev :one");
    const put = dbMock.commandCalls(PutCommand)[0]?.args[0].input;
    expect(put?.Item).toMatchObject({
      PK: "TENANT#owner#CUSTOMERS",
      SK: "CUST#c-1",
      locale: "en",
      rev: 4,
    });
    expect(put?.ExpressionAttributeValues).toEqual({ ":rev": 4 });
  });

  it("leaves a newer summary alone (concurrent change)", async () => {
    dbMock.on(UpdateCommand).resolves({ Attributes: { ...profile, displayName: "D", rev: 4 } });
    dbMock
      .on(PutCommand)
      .rejects(new ConditionalCheckFailedException({ message: "newer", $metadata: {} }));
    const result = await handler()(apiEvent("PATCH /me", { claims, body: { displayName: "D" } }));
    expect(result.statusCode).toBe(200);
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
