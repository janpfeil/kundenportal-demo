import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { DataVolumeThresholdReached } from "@kundenportal/events";
import {
  fixedTenantData,
  fixedTenantStatus,
  vendedTenantData,
} from "@kundenportal/service-kit/testing";
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
    new ConsumptionRepository(fixedTenantData()),
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
  estimatedAnnualConsumption: 2800,
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
/** Writes of the projection and readings; the customer's index entries are checked apart. */
const puts = () =>
  dbMock
    .commandCalls(PutCommand)
    .map((call) => call.args[0].input)
    .filter((input) => !String(input.Item?.SK).startsWith("CONSUMPTION#"));

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
      estimatedAnnualConsumption: 2800,
      status: "active",
      startDate: "2026-04-03",
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

  it("keeps projecting snapshots published without an annual estimate (before phase 6)", async () => {
    const { estimatedAnnualConsumption: _annual, ...older } = electricity;
    await worker(contractChanged({ ...older, version: 2 }, "updated"));
    const [projection] = puts();
    expect(projection?.Item).toMatchObject({ unit: "kWh", version: 2 });
    expect(projection?.Item).not.toHaveProperty("estimatedAnnualConsumption");
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
      startsOn: "2026-04-03",
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

  it("skips a contract before its first day and checks it on its last day", async () => {
    const watched = {
      tenantId: "owner",
      contractId: mobileId,
      customerId: "c-1",
      dataVolumeMb: 20480,
    };
    dbMock.on(QueryCommand).resolves({
      Items: [
        { ...watched, startsOn: "2026-10-01" },
        { ...watched, contractId: electricityId, endsOn: "2026-09-30" },
      ],
    });
    await worker(SCHEDULED_CHECK);
    const warned = ebMock
      .commandCalls(PutEventsCommand)
      .map(
        (call) => JSON.parse(call.args[0].input.Entries?.[0]?.Detail ?? "{}").payload.contractId,
      );
    expect(warned).toEqual([electricityId]);
    expect(dbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });

  it("drops a contract from the list once the last day of its termination has passed", async () => {
    // 1 October 00:30 in Germany: 30 September was the last day.
    now = new Date("2026-09-30T22:30:00.000Z");
    dbMock.on(QueryCommand).resolves({
      Items: [
        {
          tenantId: "owner",
          contractId: mobileId,
          customerId: "c-1",
          dataVolumeMb: 20480,
          endsOn: "2026-09-30",
        },
      ],
    });
    await worker(SCHEDULED_CHECK);
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(0);
    expect(dbMock.commandCalls(DeleteCommand)[0]?.args[0].input.Key).toEqual({
      PK: WATCH_PK,
      SK: `TENANT#owner#CONTRACT#${mobileId}`,
    });
  });
});

describe("scheduled data volume check across tenants", () => {
  const ACTIVE = "paaaaaaa";
  const GONE = "pbbbbbbb";
  const PAUSED = "pccccccc";

  it("reads the watch list from the base table and each contract from its tenant's table", async () => {
    const { data, sessions } = vendedTenantData({ baseTable: "base-table" });
    const tenantWorker = createWorker(
      new ConsumptionService(
        new ConsumptionRepository(data),
        new ConsumptionEvents(new EventBridgeClient({}), "bus"),
        { now: () => new Date("2026-09-30T06:00:00.000Z") },
        () => "id-x",
        fixedTenantStatus({ [ACTIVE]: "active", [PAUSED]: "quota-exceeded" }),
      ),
    );
    const watched = (tenantId: string) => ({
      tenantId,
      contractId: mobileId,
      customerId: "c-1",
      dataVolumeMb: 20480,
    });
    dbMock.on(QueryCommand).resolves({
      Items: [watched("owner"), watched(ACTIVE), watched(GONE), watched(PAUSED)],
    });

    await tenantWorker(SCHEDULED_CHECK);

    expect(dbMock.commandCalls(QueryCommand)[0]?.args[0].input.TableName).toBe("base-table");
    const reads = dbMock.commandCalls(GetCommand).map((call) => call.args[0].input);
    expect(reads.map((input) => [input.TableName, input.Key?.PK])).toEqual([
      ["base-table", `TENANT#owner#CONTRACT#${mobileId}`],
      [`kp-tenant-${ACTIVE}`, `TENANT#${ACTIVE}#CONTRACT#${mobileId}`],
    ]);
    const marks = puts().map((put) => [put.TableName, put.Item?.PK]);
    expect(marks).toEqual([
      ["base-table", `TENANT#owner#CONTRACT#${mobileId}`],
      [`kp-tenant-${ACTIVE}`, `TENANT#${ACTIVE}#CONTRACT#${mobileId}`],
    ]);
    // The deleted tenant leaves the (base table's) watch list; the paused one stays.
    expect(dbMock.commandCalls(DeleteCommand).map((call) => call.args[0].input)).toEqual([
      { TableName: "base-table", Key: { PK: WATCH_PK, SK: `TENANT#${GONE}#CONTRACT#${mobileId}` } },
    ]);
    expect(sessions).toEqual([ACTIVE]);
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(2);
  });
});

describe("MigratedAccountsRemoved", () => {
  const PASS = "p4k7x2qa";
  const removed = envelope("kundenportal.migration", "MigratedAccountsRemoved", {
    ...metadata,
    tenantId: PASS,
    payload: {
      reason: "demo-reset",
      accounts: [
        { subject: "sub-1", customerId: "c-1" },
        { subject: "sub-2", customerId: "c-2" },
      ],
    },
  });
  const contractPk = (id: string) => `TENANT#${PASS}#CONTRACT#${id}`;
  const custPk = (id: string) => `TENANT#${PASS}#CUST#${id}`;
  const projection = (customerId: string, contractId: string) => ({
    customerId,
    contractId,
    division: "electricity",
    status: "active",
    version: 1,
    startDate: "2026-04-05",
  });
  const index = (customer: string, contract: string) => ({
    PK: custPk(customer),
    SK: `CONSUMPTION#${contract}`,
  });

  it("finds the customers' contracts through their index entries and deletes their data, the watch list entry in the base table", async () => {
    const { data } = vendedTenantData({ baseTable: "base-table" });
    const tenantWorker = createWorker(
      new ConsumptionService(
        new ConsumptionRepository(data),
        new ConsumptionEvents(new EventBridgeClient({}), "bus"),
      ),
    );
    // c-1 has two contracts in its index, c-2 none; no scan of the table.
    dbMock
      .on(QueryCommand, {
        ExpressionAttributeValues: { ":pk": custPk("c-1"), ":prefix": "CONSUMPTION#" },
      })
      .resolves({ Items: [index("c-1", electricityId), index("c-1", mobileId)] })
      .on(QueryCommand, {
        ExpressionAttributeValues: { ":pk": custPk("c-2"), ":prefix": "CONSUMPTION#" },
      })
      .resolves({ Items: [] })
      .on(QueryCommand, { ExpressionAttributeValues: { ":pk": contractPk(electricityId) } })
      .resolves({
        Items: [
          { PK: contractPk(electricityId), SK: "CONSUMPTION" },
          { PK: contractPk(electricityId), SK: "READING#2026-04-03#r-0" },
        ],
      })
      .on(QueryCommand, { ExpressionAttributeValues: { ":pk": contractPk(mobileId) } })
      .resolves({ Items: [{ PK: contractPk(mobileId), SK: "CONSUMPTION" }] });
    dbMock.on(GetCommand).resolves({ Item: projection("c-1", electricityId) });
    dbMock.on(BatchWriteCommand).resolves({});
    dbMock.on(DeleteCommand).resolves({});

    await tenantWorker(removed);

    expect(dbMock.commandCalls(ScanCommand)).toHaveLength(0);
    const deleted = dbMock
      .commandCalls(BatchWriteCommand)
      .flatMap((call) => call.args[0].input.RequestItems?.[`kp-tenant-${PASS}`] ?? [])
      .map((r) => r.DeleteRequest?.Key);
    // The projection after the readings, the index entry last.
    expect(deleted).toEqual([
      { PK: contractPk(electricityId), SK: "READING#2026-04-03#r-0" },
      { PK: contractPk(electricityId), SK: "CONSUMPTION" },
      index("c-1", electricityId),
      { PK: contractPk(mobileId), SK: "CONSUMPTION" },
      index("c-1", mobileId),
    ]);
    expect(dbMock.commandCalls(DeleteCommand).map((call) => call.args[0].input.Key)).toEqual([
      { PK: WATCH_PK, SK: contractPk(electricityId) },
      { PK: WATCH_PK, SK: contractPk(mobileId) },
      { PK: `TENANT#${PASS}#SUBJ#sub-1`, SK: "CONSUMPTION" },
      { PK: `TENANT#${PASS}#SUBJ#sub-2`, SK: "CONSUMPTION" },
    ]);
  });

  it("leaves a contract that moved to another customer alone and drops the stale entry", async () => {
    dbMock
      .on(QueryCommand, {
        ExpressionAttributeValues: { ":pk": "TENANT#owner#CUST#c-1", ":prefix": "CONSUMPTION#" },
      })
      .resolves({ Items: [{ PK: "TENANT#owner#CUST#c-1", SK: `CONSUMPTION#${electricityId}` }] });
    // Account linking moved the contract to c-9.
    dbMock.on(GetCommand).resolves({ Item: projection("c-9", electricityId) });
    dbMock.on(BatchWriteCommand).resolves({});
    dbMock.on(DeleteCommand).resolves({});

    await worker(
      envelope("kundenportal.migration", "MigratedAccountsRemoved", {
        ...metadata,
        tenantId: "owner",
        payload: { reason: "demo-reset", accounts: [{ subject: "sub-1", customerId: "c-1" }] },
      }),
    );

    const deleted = dbMock
      .commandCalls(BatchWriteCommand)
      .flatMap((call) => Object.values(call.args[0].input.RequestItems ?? {}).flat())
      .map((r) => r.DeleteRequest?.Key);
    expect(deleted).toEqual([{ PK: "TENANT#owner#CUST#c-1", SK: `CONSUMPTION#${electricityId}` }]);
    // No contract data of c-9 is touched.
    expect(
      dbMock
        .commandCalls(QueryCommand)
        .some((call) =>
          String(call.args[0].input.ExpressionAttributeValues?.[":pk"]).includes("#CONTRACT#"),
        ),
    ).toBe(false);
  });

  it("finds the customer through the identity link when the event names only the subject (E2E run)", async () => {
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-1", SK: "CONSUMPTION" } })
      .resolves({ Item: { customerId: "c-1" } })
      .on(GetCommand, { Key: { PK: "TENANT#owner#SUBJ#sub-unknown", SK: "CONSUMPTION" } })
      .resolves({});
    dbMock.on(QueryCommand).resolves({ Items: [] });
    dbMock.on(DeleteCommand).resolves({});

    await worker(
      envelope("kundenportal.migration", "MigratedAccountsRemoved", {
        ...metadata,
        tenantId: "owner",
        payload: {
          reason: "test-run",
          accounts: [{ subject: "sub-1" }, { subject: "sub-unknown" }],
        },
      }),
    );

    // Only the known customer's index is read; the unknown identity adds none.
    const queried = dbMock
      .commandCalls(QueryCommand)
      .map((call) => call.args[0].input.ExpressionAttributeValues?.[":pk"]);
    expect(queried).toEqual(["TENANT#owner#CUST#c-1"]);
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
