import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { DataVolumeThresholdReached } from "@kundenportal/events";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { ConsumptionEvents } from "./publisher.js";
import { ConsumptionRepository, WATCH_PK } from "./repository.js";
import { ConsumptionService } from "./service.js";
import { createWorker, SCHEDULED_CHECK } from "./worker.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const ebMock = mockClient(EventBridgeClient);

let now = new Date("2026-09-30T06:00:00.000Z");
const worker = createWorker(
  new ConsumptionService(
    new ConsumptionRepository(DynamoDBDocumentClient.from(new DynamoDBClient({})), "table"),
    new ConsumptionEvents(new EventBridgeClient({}), "bus"),
    { now: () => now },
  ),
);

const metadata = {
  eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  tenantId: "owner",
  occurredAt: "2026-09-30T12:00:00.000Z",
  correlationId: "req-1",
};
const electricityId = "0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const mobileId = "1c7a4a8f-2d3e-4f60-9bac-1d2e3f4a5b6c";
const envelope = (source: string, detailType: string, detail: unknown) => ({
  version: "0",
  id: "eb-1",
  source,
  "detail-type": detailType,
  detail,
});
const contractChanged = (contract: Record<string, unknown>, changeType = "created") =>
  envelope("kundenportal.contract", "ContractChanged", {
    ...metadata,
    payload: { changeType, changes: [], contract },
  });
const electricity = {
  contractId: electricityId,
  customerId: "c-1",
  division: "electricity",
  tariffName: "Strom Klassik",
  tariffOption: "standard",
  monthlyInstallmentCent: 8700,
  meterNumber: "1EMH0012345678",
  unit: "kWh",
  startReading: { value: 18234, readAt: "2026-04-03" },
  startDate: "2026-04-03",
  status: "active",
  version: 1,
};
const mobile = {
  contractId: mobileId,
  customerId: "c-1",
  division: "mobile",
  tariffName: "Mobil Flex",
  tariffOption: "20gb",
  monthlyInstallmentCent: 1999,
  dataVolumeMb: 20480,
  startDate: "2026-04-03",
  status: "active",
  version: 1,
};
const puts = () => dbMock.commandCalls(PutCommand).map((call) => call.args[0].input);

beforeEach(() => {
  now = new Date("2026-09-30T06:00:00.000Z");
  dbMock.reset();
  ebMock.reset();
  dbMock.on(PutCommand).resolves({});
  dbMock.on(DeleteCommand).resolves({});
  dbMock.on(GetCommand).resolves({});
  ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });
});

describe("CustomerRegistered", () => {
  it("links the identity to the customer in the own projection", async () => {
    await worker(
      envelope("kundenportal.customer", "CustomerRegistered", {
        ...metadata,
        payload: {
          customerId: "c-1",
          subject: "sub-1",
          email: "anna@example.org",
          displayName: "Anna",
          locale: "de",
          origin: "registration",
        },
      }),
    );
    expect(puts()[0]?.Item).toEqual({
      PK: "TENANT#owner#SUBJ#sub-1",
      SK: "CONSUMPTION",
      customerId: "c-1",
    });
  });
});

describe("ContractChanged", () => {
  it("projects a new metered contract and stores its start reading once", async () => {
    await worker(contractChanged(electricity));

    const [projection, start] = puts();
    expect(projection?.Item).toEqual({
      PK: `TENANT#owner#CONTRACT#${electricityId}`,
      SK: "CONSUMPTION",
      contractId: electricityId,
      customerId: "c-1",
      division: "electricity",
      meterNumber: "1EMH0012345678",
      unit: "kWh",
      status: "active",
      version: 1,
    });
    expect(projection?.ConditionExpression).toBe("attribute_not_exists(PK) OR #version < :version");
    expect(start?.Item).toMatchObject({
      SK: expect.stringMatching(/^READING#2026-04-03#/),
      value: 18234,
      source: "contract-start",
    });
    expect(start?.ConditionExpression).toBe("attribute_not_exists(PK)");
  });

  it("puts a mobile contract on the watch list of the daily check", async () => {
    await worker(contractChanged(mobile));
    expect(puts()[1]?.Item).toEqual({
      PK: WATCH_PK,
      SK: `TENANT#owner#CONTRACT#${mobileId}`,
      tenantId: "owner",
      contractId: mobileId,
      customerId: "c-1",
      dataVolumeMb: 20480,
    });
  });

  it("removes a terminated mobile contract from the watch list", async () => {
    await worker(contractChanged({ ...mobile, status: "terminated", version: 2 }, "updated"));
    expect(dbMock.commandCalls(DeleteCommand)[0]?.args[0].input.Key).toEqual({
      PK: WATCH_PK,
      SK: `TENANT#owner#CONTRACT#${mobileId}`,
    });
  });

  it("ignores snapshots older than the stored projection and redelivered start readings", async () => {
    dbMock
      .on(PutCommand)
      .rejects(new ConditionalCheckFailedException({ message: "newer", $metadata: {} }));
    await expect(worker(contractChanged(mobile))).resolves.toBeUndefined();
    await expect(worker(contractChanged(electricity))).resolves.toBeUndefined();
    expect(dbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });
});

describe("scheduled data volume check", () => {
  beforeEach(() => {
    dbMock.on(QueryCommand).resolves({
      Items: [{ tenantId: "owner", contractId: mobileId, customerId: "c-1", dataVolumeMb: 20480 }],
    });
  });

  it("publishes DataVolumeThresholdReached once the usage reaches 80 % and marks the month", async () => {
    await worker(SCHEDULED_CHECK);

    const entry = ebMock.commandCalls(PutEventsCommand)[0]?.args[0].input.Entries?.[0];
    expect(entry?.DetailType).toBe("DataVolumeThresholdReached");
    const detail = DataVolumeThresholdReached.detail.parse(JSON.parse(entry?.Detail ?? "{}"));
    expect(detail).toMatchObject({
      tenantId: "owner",
      payload: { contractId: mobileId, month: "2026-09", includedMb: 20480, thresholdPercent: 80 },
    });
    expect(detail.payload.usedMb).toBeGreaterThanOrEqual(0.8 * 20480);
    expect(puts()[0]?.Item).toMatchObject({
      PK: `TENANT#owner#CONTRACT#${mobileId}`,
      SK: "USAGE#2026-09",
      thresholdNotifiedAt: "2026-09-30T06:00:00.000Z",
    });
  });

  it("stays quiet below the threshold", async () => {
    now = new Date("2026-09-10T06:00:00.000Z");
    await worker(SCHEDULED_CHECK);
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(0);
  });

  it("warns only once per month", async () => {
    dbMock.on(GetCommand).resolves({ Item: { thresholdNotifiedAt: "2026-09-21T06:00:00.000Z" } });
    await worker(SCHEDULED_CHECK);
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(0);
  });

  it("uses the same event id on a retry and fails the run so the schedule retries", async () => {
    dbMock.on(PutCommand).rejects(new Error("throttled"));
    await expect(worker(SCHEDULED_CHECK)).rejects.toThrow(/retrying/);
    await expect(worker(SCHEDULED_CHECK)).rejects.toThrow();
    const ids = ebMock
      .commandCalls(PutEventsCommand)
      .map((call) => JSON.parse(call.args[0].input.Entries?.[0]?.Detail ?? "{}").eventId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });
});

describe("failures", () => {
  it.each([
    ["no EventBridge envelope", { hello: "world" }],
    ["unknown event type", envelope("kundenportal.contract", "Unknown", {})],
    ["an invalid snapshot", contractChanged({ ...electricity, division: "heat" })],
    ["an unknown task", { task: "dropTables" }],
  ])("throws for %s so Lambda hands it to the DLQ", async (_case, input) => {
    await expect(worker(input)).rejects.toThrow();
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(0);
  });
});
