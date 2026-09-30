import { describe, expect, it } from "vitest";
import { EventSource } from "./envelope.js";
import {
  AccountsLinked,
  BulkMigrationCompleted,
  BulkMigrationStarted,
  customerIdFor,
  DuplicateCandidateFound,
  LegacyAccountMigrated,
  MigrationRecordFailed,
  originOf,
  PasswordResetRequired,
} from "./migration.js";

const metadata = {
  eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  tenantId: "owner",
  occurredAt: "2026-09-30T12:00:00.000Z",
  correlationId: "req-1",
};
const subject = "2f4c9b1e-0000-4000-8000-000000000001";
const customerId = customerIdFor("owner", subject);
const utility = { system: "utility", customerNumber: "V-1000123" } as const;
const telco = { system: "telco", customerNumber: "T/88-4711" } as const;
const electricity = {
  legacyContractId: "SV-778812",
  division: "electricity",
  tariffOption: "standard",
  monthlyInstallmentCent: 8700,
  meterNumber: "1EMH0012345678",
  unit: "kWh",
  lastReading: { value: 18234, readAt: "2026-04-03" },
  startDate: "2019-04-01",
};
const mobile = {
  legacyContractId: "M-5521",
  division: "mobile",
  tariffOption: "20gb",
  monthlyInstallmentCent: 1999,
  dataVolumeMb: 20480,
  startDate: "2021-02-15",
};

const migrated = {
  customerId,
  subject,
  email: "anna.becker@example.org",
  displayName: "Anna Becker",
  locale: "de",
  account: utility,
  mode: "lazy",
  passwordMigrated: true,
  profile: {
    firstName: "Anna",
    lastName: "Becker",
    address: { street: "Lindenweg", houseNumber: "12", postalCode: "04109", city: "Leipzig" },
    phone: "0341 1234567",
  },
  contracts: [electricity],
};

const cases = [
  [
    "DuplicateCandidateFound",
    DuplicateCandidateFound,
    {
      customerId,
      subject,
      account: utility,
      candidate: telco,
      candidateSummary: { displayName: "Bernd Yilmaz", address: "Hauptstraße 5, 04103 Leipzig" },
      matchedOn: ["name", "address"],
      score: 0.9,
    },
  ],
  [
    "AccountsLinked",
    AccountsLinked,
    {
      customerId,
      subject,
      account: utility,
      linked: telco,
      contracts: [mobile],
    },
  ],
  [
    "BulkMigrationStarted",
    BulkMigrationStarted,
    {
      runId: "run-1",
      system: "telco",
      inactiveMonths: 12,
      startedBy: subject,
    },
  ],
  [
    "BulkMigrationCompleted",
    BulkMigrationCompleted,
    {
      runId: "run-1",
      system: "telco",
      counts: {
        read: 6,
        migrated: 2,
        skippedActive: 2,
        alreadyMigrated: 0,
        clarification: 1,
        failed: 1,
      },
    },
  ],
  [
    "PasswordResetRequired",
    PasswordResetRequired,
    {
      customerId,
      subject,
      email: "carla.schulz@example.net",
      account: telco,
      reason: "hash-not-transferable",
    },
  ],
  [
    "MigrationRecordFailed",
    MigrationRecordFailed,
    {
      account: { system: "telco", customerNumber: "T/88-4719" },
      runId: "run-1",
      code: "missing-required-field",
      message: "postalCode is empty",
      fields: ["postalCode"],
      attempts: 1,
    },
  ],
] as const;

describe.each(cases)("%s", (name, event, payload) => {
  const detail = { ...metadata, payload };

  it("carries its name and the migration source", () => {
    expect(event.detailType).toBe(name);
    expect(event.source).toBe(EventSource.migration);
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

describe("LegacyAccountMigrated", () => {
  const parses = (payload: object) =>
    LegacyAccountMigrated.detail.safeParse({ ...metadata, payload }).success;

  it("is published by identity (lazy) and migration (bulk)", () => {
    expect(LegacyAccountMigrated.detailType).toBe("LegacyAccountMigrated");
    expect(LegacyAccountMigrated.sources).toEqual([EventSource.identity, EventSource.migration]);
  });

  it("carries master data and contracts of both systems", () => {
    const detail = { ...metadata, payload: migrated };
    expect(LegacyAccountMigrated.detail.parse(detail)).toEqual(detail);
    expect(parses({ ...migrated, account: telco, mode: "bulk", contracts: [mobile] })).toBe(true);
  });

  it("requires an email: accounts without one are clarification cases", () => {
    const { email: _email, ...withoutEmail } = migrated;
    expect(parses(withoutEmail)).toBe(false);
  });

  it("rejects unknown legacy systems and unnormalised addresses", () => {
    expect(parses({ ...migrated, account: { system: "gas-co", customerNumber: "1" } })).toBe(false);
    const address = { ...migrated.profile.address, postalCode: "4109" };
    expect(parses({ ...migrated, profile: { ...migrated.profile, address } })).toBe(false);
  });

  it("keeps installments in integer cents", () => {
    const contract = { ...electricity, monthlyInstallmentCent: 87.5 };
    expect(parses({ ...migrated, contracts: [contract] })).toBe(false);
  });
});

describe("migration helpers", () => {
  it("derives the same customer id for an identity in every domain", () => {
    expect(customerIdFor("owner", subject)).toBe(customerId);
    expect(customerIdFor("pass-1", subject)).not.toBe(customerId);
  });

  it("maps legacy systems to customer origins", () => {
    expect(originOf("utility")).toBe("legacy-utility");
    expect(originOf("telco")).toBe("legacy-telco");
  });

  it("requires at least one match criterion and a score between 0 and 1", () => {
    const payload = { ...cases[0][2], matchedOn: [] };
    expect(DuplicateCandidateFound.detail.safeParse({ ...metadata, payload }).success).toBe(false);
    const score = { ...cases[0][2], score: 1.5 };
    expect(DuplicateCandidateFound.detail.safeParse({ ...metadata, payload: score }).success).toBe(
      false,
    );
  });
});
