import { describe, expect, it } from "vitest";
import { DataVolumeThresholdReached, MeterReadingSubmitted } from "./consumption.js";
import { ContractChanged, InstallmentAdjusted, ProductChanged } from "./contract.js";
import { deterministicUuid, EventBridgeEnvelope } from "./delivery.js";
import { DocumentUploaded } from "./documents.js";
import { EventSource } from "./envelope.js";

const metadata = {
  eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  tenantId: "owner",
  occurredAt: "2026-09-30T12:00:00.000Z",
  correlationId: "req-1",
};
const contractId = "0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

const snapshot = {
  contractId,
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

const cases = [
  ["ContractChanged", ContractChanged, { changeType: "created", changes: [], contract: snapshot }],
  [
    "ContractChanged",
    ContractChanged,
    {
      changeType: "updated",
      changes: ["termination"],
      initiatedBy: "operator",
      reason: "Umzug ins Ausland",
      contract: {
        ...snapshot,
        productId: "strom-klassik",
        productVersion: 2,
        termination: {
          kind: "termination",
          effectiveDate: "2027-04-02",
          requestedAt: "2026-10-02T09:00:00.000Z",
          by: "operator",
        },
      },
    },
  ],
  [
    "ProductChanged",
    ProductChanged,
    {
      change: "priceVersion",
      product: {
        productId: "strom-klassik",
        division: "electricity",
        name: "Strom Klassik",
        status: "active",
        version: 2,
      },
    },
  ],
  [
    "InstallmentAdjusted",
    InstallmentAdjusted,
    {
      customerId: "c-1",
      contractId,
      division: "electricity",
      previousInstallmentCent: 8700,
      newInstallmentCent: 9700,
      estimatedAnnualConsumption: 3176,
      unit: "kWh",
      reason: "meter-reading",
      causationId: metadata.eventId,
    },
  ],
  [
    "MeterReadingSubmitted",
    MeterReadingSubmitted,
    {
      customerId: "c-1",
      contractId,
      division: "electricity",
      meterNumber: "1EMH0012345678",
      readingId: "r-1",
      value: 19800,
      unit: "kWh",
      readAt: "2026-09-30",
    },
  ],
  [
    "DataVolumeThresholdReached",
    DataVolumeThresholdReached,
    {
      customerId: "c-1",
      contractId,
      month: "2026-09",
      usedMb: 16384,
      includedMb: 20480,
      thresholdPercent: 80,
    },
  ],
  [
    "DocumentUploaded",
    DocumentUploaded,
    {
      customerId: "c-1",
      documentId: "mg6b0k000-6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
      fileName: "zaehler.jpg",
      contentType: "image/jpeg",
      category: "meter-photo",
      sizeBytes: 123456,
    },
  ],
] as const;

const payloadOf = (name: string) => cases.find(([n]) => n === name)?.[2] ?? {};

describe.each(cases)("%s", (name, event, payload) => {
  const detail = { ...metadata, payload };

  it("carries its name and the source of its domain", () => {
    expect(event.detailType).toBe(name);
    expect(Object.values(EventSource)).toContain(event.source);
  });

  it("accepts a complete event detail", () => {
    expect(event.detail.parse(detail)).toEqual(detail);
  });

  it("rejects an event without tenant", () => {
    const { tenantId: _tenantId, ...withoutTenant } = detail;
    expect(event.detail.safeParse(withoutTenant).success).toBe(false);
  });

  it("rejects an empty payload", () => {
    expect(event.detail.safeParse({ ...metadata, payload: {} }).success).toBe(false);
  });
});

describe("payload rules", () => {
  const parses = (event: { detail: { safeParse(v: unknown): { success: boolean } } }, p: object) =>
    event.detail.safeParse({ ...metadata, payload: p }).success;

  it("keeps money in integer cents", () => {
    const payload = { ...payloadOf("InstallmentAdjusted"), newInstallmentCent: 97.5 };
    expect(parses(InstallmentAdjusted, payload)).toBe(false);
  });

  it("accepts only the upload content types of the portal", () => {
    const payload = { ...payloadOf("DocumentUploaded"), contentType: "image/gif" };
    expect(parses(DocumentUploaded, payload)).toBe(false);
  });

  it("accepts snapshots without annual consumption (published before phase 6), not negative ones", () => {
    const { estimatedAnnualConsumption: _annual, ...older } = snapshot;
    expect(parses(ContractChanged, { changeType: "created", changes: [], contract: older })).toBe(
      true,
    );
    const negative = { ...snapshot, estimatedAnnualConsumption: -1 };
    expect(
      parses(ContractChanged, { changeType: "created", changes: [], contract: negative }),
    ).toBe(false);
  });

  it("rejects unknown divisions and malformed months", () => {
    const contract = { ...snapshot, division: "heat" };
    expect(parses(ContractChanged, { changeType: "created", changes: [], contract })).toBe(false);
    const month = { ...payloadOf("DataVolumeThresholdReached"), month: "2026-13" };
    expect(parses(DataVolumeThresholdReached, month)).toBe(false);
  });
});

describe("delivery helpers", () => {
  it("derives stable, valid UUIDs from a seed", () => {
    const id = deterministicUuid("event-1", "electricity");
    expect(id).toBe(deterministicUuid("event-1", "electricity"));
    expect(id).not.toBe(deterministicUuid("event-1", "gas"));
    const detail = { ...metadata, eventId: id, payload: payloadOf("MeterReadingSubmitted") };
    expect(MeterReadingSubmitted.detail.safeParse(detail).success).toBe(true);
  });

  it("parses the EventBridge envelope SQS delivers", () => {
    const envelope = { source: "kundenportal.contract", "detail-type": "X", detail: {} };
    expect(EventBridgeEnvelope.parse({ ...envelope, id: "1" })).toEqual(envelope);
    expect(EventBridgeEnvelope.safeParse({ hello: "world" }).success).toBe(false);
  });
});
