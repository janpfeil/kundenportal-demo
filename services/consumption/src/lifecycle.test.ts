import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { fixedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { ConsumptionEvents } from "./publisher.js";
import { ConsumptionRepository, WATCH_PK } from "./repository.js";
import { ConsumptionService } from "./service.js";
import { createWorker } from "./worker.js";

/** Contracts ordered, terminated and withdrawn in the portal (phase 7). */

const dbMock = mockClient(DynamoDBDocumentClient);

const worker = createWorker(
  new ConsumptionService(
    new ConsumptionRepository(fixedTenantData()),
    new ConsumptionEvents(new EventBridgeClient({}), "bus"),
    { now: () => new Date("2026-09-30T06:00:00.000Z") },
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
  dbMock.reset();
  dbMock.on(PutCommand).resolves({});
  dbMock.on(DeleteCommand).resolves({});
  dbMock.on(GetCommand).resolves({});
});

describe("ContractChanged of phase 7 (orders, terminations, withdrawals)", () => {
  const changed = (contract: Record<string, unknown>, payload: Record<string, unknown>) =>
    envelope("kundenportal.contract", "ContractChanged", {
      ...metadata,
      payload: { changeType: "updated", changes: [], ...payload, contract },
    });
  const end = (kind: string, effectiveDate: string) => ({
    kind,
    effectiveDate,
    requestedAt: "2026-09-30T05:00:00.000Z",
    by: "customer",
  });

  it("projects a contract ordered by the customer and stores its start reading like a demo contract", async () => {
    const ordered = {
      ...electricity,
      startDate: "2026-10-15",
      startReading: { value: 512.5, readAt: "2026-10-15" },
      productId: "strom-klassik",
      productVersion: 1,
    };
    await worker(changed(ordered, { changeType: "created", initiatedBy: "customer" }));

    const [projection, start] = puts();
    expect(projection?.Item).toMatchObject({
      contractId: electricityId,
      meterNumber: "1EMH0012345678",
      startDate: "2026-10-15",
      status: "active",
    });
    expect(start?.Item).toMatchObject({
      PK: `TENANT#owner#CONTRACT#${electricityId}`,
      SK: expect.stringMatching(/^READING#2026-10-15#/),
      value: 512.5,
      unit: "kWh",
      source: "contract-start",
    });
  });

  it("watches an ordered mobile contract from its first day", async () => {
    await worker(
      changed(
        { ...mobile, startDate: "2026-10-15" },
        { changeType: "created", initiatedBy: "customer" },
      ),
    );
    expect(puts()[1]?.Item).toMatchObject({ startsOn: "2026-10-15" });
  });

  it("keeps watching a mobile contract with a pending termination until its last day", async () => {
    await worker(
      changed(
        { ...mobile, version: 2, termination: end("termination", "2026-12-31") },
        { changes: ["termination"], initiatedBy: "customer" },
      ),
    );
    expect(puts()[0]?.Item).toMatchObject({
      termination: { kind: "termination", effectiveDate: "2026-12-31" },
    });
    expect(puts()[1]?.Item).toMatchObject({ PK: WATCH_PK, endsOn: "2026-12-31" });
    expect(dbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });

  it("drops a withdrawn mobile contract from the watch list at once", async () => {
    await worker(
      changed(
        {
          ...mobile,
          version: 2,
          status: "terminated",
          termination: end("withdrawal", "2026-09-30"),
        },
        { changes: ["withdrawal"], initiatedBy: "customer" },
      ),
    );
    expect(puts()).toHaveLength(1);
    expect(dbMock.commandCalls(DeleteCommand)[0]?.args[0].input.Key).toEqual({
      PK: WATCH_PK,
      SK: `TENANT#owner#CONTRACT#${mobileId}`,
    });
  });

  it("drops a withdrawal even if the snapshot still says active", async () => {
    await worker(
      changed(
        { ...mobile, version: 2, termination: end("withdrawal", "2026-09-30") },
        { changes: ["withdrawal"], initiatedBy: "customer" },
      ),
    );
    expect(dbMock.commandCalls(DeleteCommand)).toHaveLength(1);
  });

  it("puts a mobile contract back on the list when its termination is cancelled", async () => {
    await worker(changed({ ...mobile, version: 3 }, { changes: ["terminationCancelled"] }));
    expect(puts()[1]?.Item).toMatchObject({ PK: WATCH_PK, contractId: mobileId });
    expect(puts()[1]?.Item).not.toHaveProperty("endsOn");
  });
});
