import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { CustomerRegistered, customerIdFor, deterministicUuid } from "@kundenportal/events";
import { apiEvent } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createHandler } from "./app.js";
import { CustomerEvents } from "./publisher.js";
import { CustomerRepository } from "./repository.js";
import { CustomerService } from "./service.js";
import { createWorker } from "./worker.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const ebMock = mockClient(EventBridgeClient);

const SUB = "sub-anna";
const customerId = customerIdFor("owner", SUB);
const service = () =>
  new CustomerService(
    new CustomerRepository(DynamoDBDocumentClient.from(new DynamoDBClient({})), "table"),
    new CustomerEvents(new EventBridgeClient({}), "bus"),
    { now: () => new Date("2026-09-30T12:00:00.000Z") },
    () => "random-id",
  );

const address = { street: "Lindenweg", houseNumber: "12", postalCode: "04109", city: "Leipzig" };
const migrated = (source = "kundenportal.identity") => ({
  source,
  "detail-type": "LegacyAccountMigrated",
  detail: {
    eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
    tenantId: "owner",
    occurredAt: "2026-09-30T11:00:00.000Z",
    correlationId: "corr-1",
    payload: {
      customerId,
      subject: SUB,
      email: "anna.becker@example.org",
      displayName: "Anna Becker",
      locale: "de",
      account: { system: "utility", customerNumber: "V-1000123" },
      mode: "lazy",
      passwordMigrated: true,
      profile: { firstName: "Anna", lastName: "Becker", address, phone: "0341 2345678" },
      contracts: [],
    },
  },
});

const registered = () =>
  CustomerRegistered.detail.parse(
    JSON.parse(
      ebMock.commandCalls(PutEventsCommand)[0]?.args[0].input.Entries?.[0]?.Detail ?? "{}",
    ),
  );

beforeEach(() => {
  dbMock.reset();
  ebMock.reset();
  ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });
});

describe("customer worker", () => {
  it("creates the migrated customer with legacy master data and announces it", async () => {
    dbMock.on(TransactWriteCommand).resolves({});
    await createWorker(service())(migrated());

    const profile =
      dbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems?.[1]?.Put?.Item;
    expect(profile).toMatchObject({
      PK: `TENANT#owner#CUST#${customerId}`,
      origin: "legacy-utility",
      address,
      phone: "0341 2345678",
      legacyAccounts: new Set(["utility:V-1000123"]),
    });
    expect(registered()).toMatchObject({
      eventId: deterministicUuid(customerId, "CustomerRegistered"),
      payload: { customerId, subject: SUB, origin: "legacy-utility" },
    });
  });

  it("accepts the bulk import's source as well", async () => {
    dbMock.on(TransactWriteCommand).resolves({});
    await createWorker(service())(migrated("kundenportal.migration"));
    expect(dbMock.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });

  it("completes a profile the first /me already created and announces the same event", async () => {
    dbMock
      .on(TransactWriteCommand)
      .rejects(new TransactionCanceledException({ message: "x", $metadata: {} }));
    dbMock
      .on(GetCommand, { Key: { PK: `TENANT#owner#SUBJ#${SUB}`, SK: "CUSTOMER" } })
      .resolves({ Item: { customerId } })
      .on(GetCommand, { Key: { PK: `TENANT#owner#CUST#${customerId}`, SK: "PROFILE" } })
      .resolves({
        Item: {
          customerId,
          email: "anna.becker@example.org",
          displayName: "Anna Becker",
          locale: "de",
          origin: "legacy-utility",
          createdAt: "2026-09-30T11:00:01.000Z",
        },
      });
    dbMock.on(UpdateCommand).resolves({});

    await createWorker(service())(migrated());

    const update = dbMock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(update?.UpdateExpression).toBe(
      "SET #address = if_not_exists(#address, :address), #phone = if_not_exists(#phone, :phone) ADD #legacyAccounts :account",
    );
    expect(registered().eventId).toBe(deterministicUuid(customerId, "CustomerRegistered"));
  });

  it("records a linked account", async () => {
    dbMock.on(UpdateCommand).resolves({});
    await createWorker(service())({
      source: "kundenportal.migration",
      "detail-type": "AccountsLinked",
      detail: {
        eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c12",
        tenantId: "owner",
        occurredAt: "2026-09-30T11:00:00.000Z",
        correlationId: "c",
        payload: {
          customerId,
          subject: SUB,
          account: { system: "utility", customerNumber: "V-1000124" },
          linked: { system: "telco", customerNumber: "T/88-4711" },
          contracts: [],
        },
      },
    });
    const update = dbMock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(update?.ExpressionAttributeValues).toEqual({ ":account": new Set(["telco:T/88-4711"]) });
  });

  it("rejects invalid and unknown events so they end in the DLQ", async () => {
    const worker = createWorker(service());
    await expect(
      worker({
        source: "kundenportal.identity",
        "detail-type": "LegacyAccountMigrated",
        detail: {},
      }),
    ).rejects.toThrow("Invalid");
    await expect(worker({ source: "x", "detail-type": "Y", detail: {} })).rejects.toThrow(
      "No handler",
    );
    await expect(worker("nonsense")).rejects.toThrow("not an EventBridge event");
  });
});

describe("GET /me of a migrated account", () => {
  it("uses the derived customer id and the legacy origin from the token", async () => {
    dbMock.on(GetCommand).resolves({});
    dbMock.on(TransactWriteCommand).resolves({});
    const claims = {
      sub: SUB,
      email: "anna.becker@example.org",
      name: "Anna Becker",
      origin: "legacy-utility",
    };
    const result = await createHandler(service())(apiEvent("GET /me", { claims }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body ?? "{}");
    expect(body).toMatchObject({ origin: "legacy-utility" });
    expect(registered().payload.origin).toBe("legacy-utility");
    expect(registered().eventId).toBe(deterministicUuid(body.customerId, "CustomerRegistered"));
  });
});
