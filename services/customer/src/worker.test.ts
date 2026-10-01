import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { CustomerRegistered, customerIdFor, deterministicUuid } from "@kundenportal/events";
import { apiEvent, fixedTenantData, vendedTenantData } from "@kundenportal/service-kit/testing";
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
    new CustomerRepository(fixedTenantData()),
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
    dbMock.on(UpdateCommand).resolves({
      Attributes: {
        customerId,
        email: "anna.becker@example.org",
        displayName: "Anna Becker",
        locale: "de",
        origin: "legacy-utility",
        createdAt: "2026-09-30T11:00:01.000Z",
        address,
        legacyAccounts: new Set(["utility:V-1000123"]),
        rev: 2,
        listed: true,
      },
    });
    dbMock.on(PutCommand).resolves({});

    await createWorker(service())(migrated());

    const update = dbMock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(update?.UpdateExpression).toBe(
      "SET #address = if_not_exists(#address, :address), #phone = if_not_exists(#phone, :phone), #listed = :true ADD #legacyAccounts :account, #rev :one",
    );
    expect(update?.ReturnValues).toBe("ALL_NEW");
    // The directory's summary follows the completed profile.
    expect(dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item).toMatchObject({
      PK: "TENANT#owner#CUSTOMERS",
      SK: `CUST#${customerId}`,
      address,
      legacyAccounts: ["utility:V-1000123"],
      rev: 2,
    });
    expect(registered().eventId).toBe(deterministicUuid(customerId, "CustomerRegistered"));
    expect(registered().occurredAt).toBe("2026-09-30T11:00:01.000Z");
  });

  it("records a linked account and refreshes the directory's summary", async () => {
    dbMock.on(UpdateCommand).resolves({
      Attributes: {
        customerId,
        email: "anna.becker@example.org",
        displayName: "Anna Becker",
        locale: "de",
        origin: "legacy-utility",
        createdAt: "2026-09-30T11:00:00.000Z",
        legacyAccounts: new Set(["utility:V-1000123", "telco:T/88-4711"]),
        rev: 3,
        listed: true,
      },
    });
    dbMock.on(PutCommand).resolves({});
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
    expect(update?.ExpressionAttributeValues).toEqual({
      ":account": new Set(["telco:T/88-4711"]),
      ":true": true,
      ":one": 1,
    });
    expect(dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item).toMatchObject({
      SK: `CUST#${customerId}`,
      legacyAccounts: ["telco:T/88-4711", "utility:V-1000123"],
      rev: 3,
    });
  });

  it("deletes profile, identity link and directory entries of removed accounts only, also when redelivered", async () => {
    dbMock.on(BatchWriteCommand).resolves({});
    dbMock.on(QueryCommand).resolves({
      Items: [{ PK: "TENANT#p4k7x2qa#CUSTOMERS", SK: `CUST#${customerId}#C#k-1` }],
    });
    const removed = {
      source: "kundenportal.migration",
      "detail-type": "MigratedAccountsRemoved",
      detail: {
        eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c13",
        tenantId: "p4k7x2qa",
        occurredAt: "2026-09-30T11:00:00.000Z",
        correlationId: "c",
        payload: { reason: "demo-reset", accounts: [{ subject: SUB, customerId }] },
      },
    };
    const worker = createWorker(service());
    await worker(removed);
    await worker(removed);

    const deletes = dbMock
      .commandCalls(BatchWriteCommand)
      .map((c) => c.args[0].input.RequestItems?.table?.map((r) => r.DeleteRequest?.Key));
    const directory = [
      { PK: "TENANT#p4k7x2qa#CUSTOMERS", SK: `CUST#${customerId}#C#k-1` },
      { PK: "TENANT#p4k7x2qa#CUSTOMERS", SK: `CUST#${customerId}` },
    ];
    const profile = [
      { PK: `TENANT#p4k7x2qa#CUST#${customerId}`, SK: "PROFILE" },
      { PK: `TENANT#p4k7x2qa#SUBJ#${SUB}`, SK: "CUSTOMER" },
    ];
    expect(deletes).toEqual([directory, profile, directory, profile]);
    // Only this customer's contract summaries are looked up, nothing else is touched.
    const query = dbMock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(query?.ExpressionAttributeValues).toEqual({
      ":pk": "TENANT#p4k7x2qa#CUSTOMERS",
      ":prefix": `CUST#${customerId}#C#`,
    });
    expect(dbMock.calls()).toHaveLength(6);
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

describe("tenant isolation", () => {
  const A = "paaaaaaa";
  const B = "pbbbbbbb";
  const forTenant = (tenantId: string) => {
    const event = migrated();
    return { ...event, detail: { ...event.detail, tenantId } };
  };

  it("writes each pass tenant's events to its own table with its own client", async () => {
    dbMock.on(TransactWriteCommand).resolves({});
    const { data, sessions } = vendedTenantData({ baseTable: "base-table" });
    const worker = createWorker(
      new CustomerService(
        new CustomerRepository(data),
        new CustomerEvents(new EventBridgeClient({}), "bus"),
        { now: () => new Date("2026-09-30T12:00:00.000Z") },
        () => "random-id",
      ),
    );

    await worker(forTenant(A));
    await worker(forTenant(B));
    await worker(forTenant(A));

    const writes = dbMock.commandCalls(TransactWriteCommand);
    const tables = writes.map((call) =>
      call.args[0].input.TransactItems?.map((item) => item.Put?.TableName),
    );
    expect(tables).toEqual([
      [`kp-tenant-${A}`, `kp-tenant-${A}`, `kp-tenant-${A}`],
      [`kp-tenant-${B}`, `kp-tenant-${B}`, `kp-tenant-${B}`],
      [`kp-tenant-${A}`, `kp-tenant-${A}`, `kp-tenant-${A}`],
    ]);
    expect(tables.flat()).not.toContain("base-table");
    const keys = writes.map((call) => call.args[0].input.TransactItems?.[1]?.Put?.Item?.PK);
    expect(keys[1]).toMatch(new RegExp(`^TENANT#${B}#`));
    // One STS session per tenant; A's cached client serves A again, never B.
    expect(sessions).toEqual([A, B]);
    const [a1, b, a2] = await Promise.all([data(A), data(B), data(A)]);
    expect(a2.db).toBe(a1.db);
    expect(b.db).not.toBe(a1.db);
    expect(await b.db.config.credentials()).toMatchObject({
      accessKeyId: `ASIA${B.toUpperCase()}`,
    });
  });

  it("refuses a tenant id that is neither the owner nor a pass", async () => {
    const { data } = vendedTenantData({ baseTable: "base-table" });
    const worker = createWorker(
      new CustomerService(
        new CustomerRepository(data),
        new CustomerEvents(new EventBridgeClient({}), "bus"),
      ),
    );
    await expect(worker(forTenant("someone-else"))).rejects.toThrow(/Unknown tenant/);
    expect(dbMock.calls()).toHaveLength(0);
  });
});
