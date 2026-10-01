import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ContractChanged, InstallmentAdjusted } from "@kundenportal/events";
import { fixedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { demoContracts } from "./contract.js";
import { ContractEvents } from "./publisher.js";
import { ContractRepository } from "./repository.js";
import { ContractService } from "./service.js";
import { createWorker } from "./worker.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const ebMock = mockClient(EventBridgeClient);

const worker = createWorker(
  new ContractService(
    new ContractRepository(fixedTenantData()),
    new ContractEvents(new EventBridgeClient({}), "bus"),
    { now: () => new Date("2026-09-30T13:00:00.000Z") },
  ),
);

const registrationId = "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11";
const readingEventId = "7a2d2e75-9b5d-4d66-8b4a-6e9b5b1f3d22";
const registered = {
  eventId: registrationId,
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
};
const [electricity] = demoContracts("c-1", registrationId, registered.occurredAt);
if (!electricity) throw new Error("demo contract missing");
const reading = (value: number, readAt = "2026-09-30") => ({
  eventId: readingEventId,
  tenantId: "owner",
  occurredAt: "2026-09-30T12:30:00.000Z",
  correlationId: "req-2",
  payload: {
    customerId: "c-1",
    contractId: electricity.contractId,
    division: "electricity",
    meterNumber: electricity.meterNumber,
    readingId: "r-1",
    value,
    unit: "kWh",
    readAt,
  },
});

const envelope = (source: string, detailType: string, detail: unknown) => ({
  source,
  "detail-type": detailType,
  detail,
});
const customerRegistered = (d: unknown = registered) =>
  envelope("kundenportal.customer", "CustomerRegistered", d);
const meterReading = (d: unknown) =>
  envelope("kundenportal.consumption", "MeterReadingSubmitted", d);
const published = () =>
  ebMock
    .commandCalls(PutEventsCommand)
    .flatMap((call) => call.args[0].input.Entries ?? [])
    .map((entry) => ({ type: entry.DetailType, detail: JSON.parse(entry.Detail ?? "{}") }));

beforeEach(() => {
  dbMock.reset();
  ebMock.reset();
  dbMock.on(PutCommand).resolves({});
  dbMock.on(GetCommand).resolves({ Item: electricity });
  ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });
});

describe("CustomerRegistered", () => {
  it("links the identity, creates demo contracts and publishes ContractChanged(created)", async () => {
    await expect(worker(customerRegistered())).resolves.toBeUndefined();
    const puts = dbMock.commandCalls(PutCommand).map((call) => call.args[0].input);
    expect(puts[0]?.Item).toEqual({
      PK: "TENANT#owner#SUBJ#sub-1",
      SK: "CONTRACTS",
      customerId: "c-1",
    });
    expect(puts.slice(1).map((put) => put.Item?.SK)).toEqual([
      expect.stringMatching(/^CONTRACT#electricity#/),
      expect.stringMatching(/^CONTRACT#gas#/),
      expect.stringMatching(/^CONTRACT#mobile#/),
    ]);
    expect(puts[1]?.ConditionExpression).toBe("attribute_not_exists(PK)");

    const events = published();
    expect(events).toHaveLength(3);
    for (const { type, detail } of events) {
      expect(type).toBe("ContractChanged");
      expect(ContractChanged.detail.parse(detail).payload.changeType).toBe("created");
    }
    // Metered snapshots carry the annual consumption the consumption domain estimates with.
    const annual = events.map(
      (e) => ContractChanged.detail.parse(e.detail).payload.contract.estimatedAnnualConsumption,
    );
    expect(annual).toEqual([2800, 1200, undefined]);
  });

  it("is idempotent: a redelivery creates nothing new and re-publishes the same event ids", async () => {
    await worker(customerRegistered());
    const firstIds = published().map((e) => e.detail.eventId);
    dbMock
      .on(PutCommand, { ConditionExpression: "attribute_not_exists(PK)" })
      .rejects(new ConditionalCheckFailedException({ message: "exists", $metadata: {} }));
    ebMock.resetHistory();

    await expect(worker(customerRegistered())).resolves.toBeUndefined();
    expect(published().map((e) => e.detail.eventId)).toEqual(firstIds);
  });

  it("gives legacy customers no demo contracts (they come with their migration)", async () => {
    const legacy = { ...registered, payload: { ...registered.payload, origin: "legacy-utility" } };
    await worker(customerRegistered(legacy));
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(1);
    expect(published()).toEqual([]);
  });
});

describe("MeterReadingSubmitted", () => {
  it("recalculates the installment from the start reading and publishes InstallmentAdjusted", async () => {
    await expect(worker(meterReading(reading(19800)))).resolves.toBeUndefined();
    const put = dbMock.commandCalls(PutCommand)[0]?.args[0].input;
    expect(put?.Item).toMatchObject({
      monthlyInstallmentCent: 9700,
      estimatedAnnualConsumption: 3176,
      installmentMinCent: 7700,
      installmentMaxCent: 14600,
      lastReading: { value: 19800, readAt: "2026-09-30", eventId: readingEventId },
      version: 2,
    });
    const [adjusted] = published();
    expect(adjusted?.type).toBe("InstallmentAdjusted");
    expect(InstallmentAdjusted.detail.parse(adjusted?.detail)).toMatchObject({
      correlationId: "req-2",
      payload: {
        previousInstallmentCent: 8700,
        newInstallmentCent: 9700,
        reason: "meter-reading",
        causationId: readingEventId,
      },
    });
  });

  it("stores a reading that matches the current installment without publishing", async () => {
    // 1381 kWh in 180 days → 2800 kWh a year → still 87 €
    await worker(meterReading(reading(18234 + 1381)));
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(1);
    expect(published()).toEqual([]);
  });

  it("re-publishes the stored adjustment when the event is redelivered", async () => {
    await worker(meterReading(reading(19800)));
    const stored = dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item;
    const firstId = published()[0]?.detail.eventId;
    dbMock.reset();
    dbMock.on(GetCommand).resolves({ Item: stored });
    ebMock.resetHistory();

    await worker(meterReading(reading(19800)));

    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
    expect(published().map((e) => e.detail.eventId)).toEqual([firstId]);
  });

  it("ignores a reading older than the last one applied", async () => {
    dbMock.on(GetCommand).resolves({
      Item: {
        ...electricity,
        lastReading: { value: 19800, readAt: "2026-09-30", eventId: registrationId },
      },
    });
    await worker(meterReading(reading(19700, "2026-09-20")));
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  it("throws for a retry if the contract changed concurrently", async () => {
    dbMock
      .on(PutCommand)
      .rejects(new ConditionalCheckFailedException({ message: "version", $metadata: {} }));
    await expect(worker(meterReading(reading(19800)))).rejects.toThrow();
    expect(published()).toEqual([]);
  });
});

const legacyContracts = [
  {
    legacyContractId: "SV-778812",
    division: "electricity",
    tariffOption: "oeko",
    monthlyInstallmentCent: 8700,
    meterNumber: "1EMH0012345678",
    unit: "kWh",
    lastReading: { value: 18234, readAt: "2026-04-03" },
    startDate: "2019-04-01",
  },
  {
    legacyContractId: "MOB-812233",
    division: "mobile",
    tariffOption: "20gb",
    monthlyInstallmentCent: 1999,
    dataVolumeMb: 20480,
    startDate: "2021-02-15",
  },
];
const migrated = {
  ...registered,
  payload: {
    customerId: "c-legacy",
    subject: "sub-anna",
    email: "anna.becker@example.org",
    displayName: "Anna Becker",
    locale: "de",
    account: { system: "utility", customerNumber: "V-1000123" },
    mode: "lazy",
    passwordMigrated: true,
    profile: {
      firstName: "Anna",
      lastName: "Becker",
      address: { street: "Lindenweg", houseNumber: "12", postalCode: "04109", city: "Leipzig" },
    },
    contracts: legacyContracts,
  },
};

describe("LegacyAccountMigrated", () => {
  it("links the identity and takes over the legacy contracts with their installments", async () => {
    await worker(envelope("kundenportal.identity", "LegacyAccountMigrated", migrated));
    const puts = dbMock.commandCalls(PutCommand).map((call) => call.args[0].input.Item ?? {});
    expect(puts[0]).toMatchObject({ PK: "TENANT#owner#SUBJ#sub-anna", customerId: "c-legacy" });
    expect(puts[1]).toMatchObject({
      customerId: "c-legacy",
      division: "electricity",
      tariffName: "Strom Klassik",
      tariffOption: "oeko",
      monthlyInstallmentCent: 8700,
      legacyContractId: "SV-778812",
      startReading: { value: 18234, readAt: "2026-04-03" },
    });
    expect(puts[1]?.installmentMinCent).toBeLessThanOrEqual(8700);
    expect(puts[1]?.installmentMaxCent).toBeGreaterThanOrEqual(8700);
    expect(puts[2]).toMatchObject({
      division: "mobile",
      dataVolumeMb: 20480,
      monthlyInstallmentCent: 1999,
    });
    const events = published();
    expect(events.map((e) => e.type)).toEqual(["ContractChanged", "ContractChanged"]);
    const snapshot = ContractChanged.detail.parse(events[0]?.detail).payload.contract;
    expect(snapshot.customerId).toBe("c-legacy");
    expect(snapshot.estimatedAnnualConsumption).toBe(puts[1]?.estimatedAnnualConsumption);
    expect(snapshot.estimatedAnnualConsumption).toBeGreaterThan(0);
  });

  it("is idempotent across sources and redeliveries (same contract and event ids)", async () => {
    await worker(envelope("kundenportal.identity", "LegacyAccountMigrated", migrated));
    const first = published().map((e) => e.detail.eventId);
    ebMock.resetHistory();
    dbMock
      .on(PutCommand, { ConditionExpression: "attribute_not_exists(PK)" })
      .rejects(new ConditionalCheckFailedException({ message: "x", $metadata: {} }));
    await worker(envelope("kundenportal.migration", "LegacyAccountMigrated", migrated));
    expect(published().map((e) => e.detail.eventId)).toEqual(first);
  });

  it("moves the contracts of a linked account to the confirming customer", async () => {
    await worker(
      envelope("kundenportal.migration", "AccountsLinked", {
        ...registered,
        payload: {
          customerId: "c-bernd",
          subject: "sub-bernd",
          account: { system: "utility", customerNumber: "V-1000124" },
          linked: { system: "telco", customerNumber: "T/88-4711" },
          contracts: [legacyContracts[1]],
        },
      }),
    );
    const put = dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item;
    expect(put).toMatchObject({
      customerId: "c-bernd",
      division: "mobile",
      legacyContractId: "MOB-812233",
    });
  });
});

describe("MigratedAccountsRemoved", () => {
  const removed = envelope("kundenportal.migration", "MigratedAccountsRemoved", {
    eventId: "8b3e3f86-ac6e-4e77-9c5b-7f0c6c2e4e33",
    tenantId: "p4k7x2qa",
    occurredAt: "2026-09-30T14:00:00.000Z",
    correlationId: "req-reset",
    payload: {
      reason: "demo-reset",
      accounts: [
        { subject: "sub-1", customerId: "c-1" },
        { subject: "sub-2", customerId: "c-2" },
      ],
    },
  });
  const pk = (customerId: string) => `TENANT#p4k7x2qa#CUST#${customerId}`;

  it("deletes the removed customers' contracts and identity links, also when redelivered", async () => {
    dbMock
      .on(QueryCommand, { ExpressionAttributeValues: { ":pk": pk("c-1") } })
      .resolves({ Items: [{ PK: pk("c-1"), SK: "CONTRACT#electricity#k-1" }] })
      .on(QueryCommand, { ExpressionAttributeValues: { ":pk": pk("c-2") } })
      .resolvesOnce({ Items: [{ PK: pk("c-2"), SK: "CONTRACT#mobile#k-2" }] })
      .resolves({ Items: [] });
    dbMock.on(BatchWriteCommand).resolves({});

    await worker(removed);
    const deletes = () =>
      dbMock
        .commandCalls(BatchWriteCommand)
        .map((c) => c.args[0].input.RequestItems?.table?.map((r) => r.DeleteRequest?.Key));
    expect(deletes()).toEqual([
      [
        { PK: pk("c-1"), SK: "CONTRACT#electricity#k-1" },
        { PK: "TENANT#p4k7x2qa#SUBJ#sub-1", SK: "CONTRACTS" },
      ],
      [
        { PK: pk("c-2"), SK: "CONTRACT#mobile#k-2" },
        { PK: "TENANT#p4k7x2qa#SUBJ#sub-2", SK: "CONTRACTS" },
      ],
    ]);
    // Only the contracts of the customer's partition, never its other items.
    const query = dbMock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(query?.ExpressionAttributeValues).toEqual({
      ":pk": pk("c-1"),
      ":prefix": "CONTRACT#",
    });

    await worker(removed);
    expect(deletes()).toHaveLength(4);
    expect(published()).toEqual([]);
  });
});

describe("failures", () => {
  it.each([
    ["no EventBridge envelope", { hello: "world" }],
    ["unknown event type", envelope("kundenportal.customer", "Unknown", {})],
    ["missing tenant", customerRegistered({ ...registered, tenantId: undefined })],
    ["negative reading", meterReading(reading(-1))],
  ])("throws for %s so Lambda hands it to the DLQ", async (_case, body) => {
    await expect(worker(body)).rejects.toThrow();
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  it("sends readings for unknown contracts to the DLQ", async () => {
    dbMock.on(GetCommand).resolves({});
    await expect(worker(meterReading(reading(19800)))).rejects.toThrow();
  });

  it("throws on infrastructure errors so Lambda retries", async () => {
    dbMock.on(PutCommand).rejects(new Error("throttled"));
    await expect(worker(customerRegistered())).rejects.toThrow();
  });
});
