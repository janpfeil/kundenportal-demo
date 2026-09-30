import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ContractChanged, InstallmentAdjusted } from "@kundenportal/events";
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
    new ContractRepository(DynamoDBDocumentClient.from(new DynamoDBClient({})), "table"),
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
