import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { PutCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { ContractChanged, InstallmentAdjusted } from "@kundenportal/events";
import { beforeEach, describe, expect, it } from "vitest";
import { demoContracts } from "./origins.js";
import { contractItem, fixture } from "./testing/fixture.js";

const f = fixture();
const worker = f.worker;
const published = () => f.published();

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
const electricityKey = [
  "TENANT#owner#CUST#c-1",
  `CONTRACT#electricity#${electricity.contractId}`,
] as const;
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

beforeEach(() => {
  f.reset();
});

describe("CustomerRegistered", () => {
  it("marks the contracts of an E2E account at the reserved .invalid domain", async () => {
    const test = {
      ...registered,
      payload: { ...registered.payload, email: "e2e-1@kundenportal.invalid" },
    };
    await worker(customerRegistered(test));
    expect(f.table.get("TENANT#owner#SUBJ#sub-1", "CONTRACTS")).toMatchObject({
      testAccount: true,
    });
    expect(f.table.get(...electricityKey)).toMatchObject({ testAccount: true });
    for (const item of f.table.partition("TENANT#owner#CONTRACTS")) {
      expect(item).toMatchObject({ testAccount: true });
    }
  });

  it("links the identity, creates demo contracts with directory entries and publishes created", async () => {
    await expect(worker(customerRegistered())).resolves.toBeUndefined();
    expect(f.table.get("TENANT#owner#SUBJ#sub-1", "CONTRACTS")).toEqual({
      PK: "TENANT#owner#SUBJ#sub-1",
      SK: "CONTRACTS",
      customerId: "c-1",
      customerName: "Anna",
    });
    const transactions = f.dbMock
      .commandCalls(TransactWriteCommand)
      .map((call) => call.args[0].input.TransactItems?.map((item) => item.Put?.Item?.SK));
    expect(transactions).toEqual([
      [
        expect.stringMatching(/^CONTRACT#electricity#/),
        expect.stringMatching(/^CONTRACT#[0-9a-f-]+$/),
      ],
      [expect.stringMatching(/^CONTRACT#gas#/), expect.stringMatching(/^CONTRACT#[0-9a-f-]+$/)],
      [expect.stringMatching(/^CONTRACT#mobile#/), expect.stringMatching(/^CONTRACT#[0-9a-f-]+$/)],
    ]);
    expect(f.table.get(...electricityKey)).toMatchObject({
      productId: "strom-klassik",
      productVersion: 1,
      noticePeriodMonths: 1,
      customerName: "Anna",
      listed: true,
    });
    expect(f.table.partition("TENANT#owner#CONTRACTS")).toHaveLength(3);

    const events = published();
    expect(events).toHaveLength(3);
    for (const { type, detail } of events) {
      expect(type).toBe("ContractChanged");
      const payload = ContractChanged.detail.parse(detail).payload;
      expect(payload).toMatchObject({ changeType: "created", initiatedBy: "system" });
    }
    // Metered snapshots carry the annual consumption the consumption domain estimates with.
    const annual = events.map(
      (e) => ContractChanged.detail.parse(e.detail).payload.contract.estimatedAnnualConsumption,
    );
    expect(annual).toEqual([2800, 1200, undefined]);
  });

  it("is idempotent: a redelivery after success creates and publishes nothing", async () => {
    await worker(customerRegistered());
    const items = f.table.items.size;
    f.ebMock.resetHistory();

    await expect(worker(customerRegistered())).resolves.toBeUndefined();
    expect(f.table.items.size).toBe(items);
    expect(published()).toHaveLength(0);
  });

  it("links last: a redelivery after a failed publish re-publishes the same event ids", async () => {
    let calls = 0;
    f.ebMock.on(PutEventsCommand).callsFake(async () => {
      calls += 1;
      if (calls === 1) throw new Error("throttled");
      return { FailedEntryCount: 0 };
    });
    await expect(worker(customerRegistered())).rejects.toThrow("throttled");
    expect(f.table.get("TENANT#owner#SUBJ#sub-1", "CONTRACTS")).toBeUndefined();
    const items = f.table.items.size;
    f.ebMock.resetHistory();

    await worker(customerRegistered());
    expect(f.table.items.size).toBe(items + 1);
    expect(published()).toHaveLength(3);
    await worker(customerRegistered({ ...registered, correlationId: "req-9" }));
    expect(published()).toHaveLength(3);
  });

  it("gives a customer from before this domain demo contracts on the repeated announcement", async () => {
    const repeated = {
      ...registered,
      eventId: "8b3e3f86-ac6e-4e77-9c5b-7f0c6c2a4e33",
      occurredAt: "2026-10-02T09:00:00.000Z",
    };
    await worker(customerRegistered(repeated));
    expect(f.table.get("TENANT#owner#SUBJ#sub-1", "CONTRACTS")).toMatchObject({
      customerId: "c-1",
    });
    expect(f.table.partition("TENANT#owner#CONTRACTS")).toHaveLength(3);
    expect(published()).toHaveLength(3);
  });

  it("only refreshes the link of a known identity on the repeated announcement", async () => {
    await worker(customerRegistered());
    const items = f.table.items.size;
    f.ebMock.resetHistory();

    await worker(
      customerRegistered({
        ...registered,
        eventId: "8b3e3f86-ac6e-4e77-9c5b-7f0c6c2a4e33",
        payload: { ...registered.payload, displayName: "Anna Berg" },
      }),
    );
    expect(f.table.items.size).toBe(items);
    expect(published()).toHaveLength(0);
    expect(f.table.get("TENANT#owner#SUBJ#sub-1", "CONTRACTS")).toMatchObject({
      customerName: "Anna Berg",
    });
  });

  it("does not overwrite a contract changed since (redelivery after a change)", async () => {
    await worker(customerRegistered());
    const stored = f.table.get(...electricityKey);
    if (stored) stored.monthlyInstallmentCent = 9900;
    await worker(customerRegistered());
    expect(f.table.get(...electricityKey)?.monthlyInstallmentCent).toBe(9900);
  });

  it("gives legacy customers no demo contracts (they come with their migration)", async () => {
    const legacy = { ...registered, payload: { ...registered.payload, origin: "legacy-utility" } };
    await worker(customerRegistered(legacy));
    expect(f.dbMock.commandCalls(PutCommand)).toHaveLength(1);
    expect(f.dbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    expect(published()).toEqual([]);
  });
});

describe("MeterReadingSubmitted", () => {
  beforeEach(() => {
    f.table.put(contractItem({ ...electricity, listed: true }));
  });

  it("recalculates the installment, keeps a history entry and publishes InstallmentAdjusted", async () => {
    await expect(worker(meterReading(reading(19800)))).resolves.toBeUndefined();
    expect(f.table.get(...electricityKey)).toMatchObject({
      monthlyInstallmentCent: 9700,
      estimatedAnnualConsumption: 3176,
      installmentMinCent: 7700,
      installmentMaxCent: 14600,
      lastReading: { value: 19800, readAt: "2026-09-30", eventId: readingEventId },
      version: 2,
    });
    expect(
      f.table.get("TENANT#owner#CUST#c-1", `HISTORY#${electricity.contractId}#000002`),
    ).toMatchObject({
      change: "installment",
      by: "system",
      summary: "Abschlag 87 € → 97 € nach Zählerstand",
    });
    expect(
      f.table.get("TENANT#owner#CONTRACTS", `CONTRACT#${electricity.contractId}`),
    ).toMatchObject({ monthlyInstallmentCent: 9700 });
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

  it("uses the prices of the contract's own price version", async () => {
    f.table.put(
      contractItem({ ...electricity, listed: true, productId: "strom-natur", productVersion: 1 }),
      {
        PK: "TENANT#owner#PRODUCTS",
        SK: "PRODUCT#strom-natur",
        productId: "strom-natur",
        division: "electricity",
        name: "Strom Natur",
        description: "",
        status: "active",
        unit: "kWh",
        minimumTermMonths: 12,
        noticePeriodMonths: 1,
        versions: [
          {
            version: 1,
            validFrom: "2026-01-01",
            createdAt: "2026-01-01T00:00:00.000Z",
            options: [
              {
                optionId: "standard",
                label: "Standard",
                monthlyPriceCent: 1000,
                workPriceCent: 40,
              },
            ],
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        revision: 1,
      },
    );
    await worker(meterReading(reading(19800)));
    // (3176 kWh × 40 ct + 12 × 1000 ct) / 12 = 11587 ct → 116 €
    expect(f.table.get(...electricityKey)?.monthlyInstallmentCent).toBe(11600);
  });

  it("stores a reading that matches the current installment without history or event", async () => {
    // 1381 kWh in 180 days → 2800 kWh a year → still 87 €
    await worker(meterReading(reading(18234 + 1381)));
    const items = f.dbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items).toHaveLength(2);
    expect(published()).toEqual([]);
  });

  it("re-publishes the stored adjustment when the event is redelivered", async () => {
    await worker(meterReading(reading(19800)));
    const firstId = published()[0]?.detail.eventId;
    f.ebMock.resetHistory();
    f.dbMock.resetHistory();

    await worker(meterReading(reading(19800)));

    expect(f.dbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    expect(published().map((e) => e.detail.eventId)).toEqual([firstId]);
  });

  it("ignores a reading older than the last one applied", async () => {
    f.table.put(
      contractItem({
        ...electricity,
        lastReading: { value: 19800, readAt: "2026-09-30", eventId: registrationId },
      }),
    );
    await worker(meterReading(reading(19700, "2026-09-20")));
    expect(f.dbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it("throws for a retry if the contract changed concurrently", async () => {
    f.dbMock.on(TransactWriteCommand).rejects(
      new TransactionCanceledException({
        message: "cancelled",
        $metadata: {},
        CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
      }),
    );
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
const legacyContractsOf = (customerId: string) =>
  f.table.partition(`TENANT#owner#CUST#${customerId}`, "CONTRACT#");

describe("LegacyAccountMigrated", () => {
  it("links the identity and takes over the legacy contracts on the default products", async () => {
    await worker(envelope("kundenportal.identity", "LegacyAccountMigrated", migrated));
    expect(f.table.get("TENANT#owner#SUBJ#sub-anna", "CONTRACTS")).toMatchObject({
      customerId: "c-legacy",
      customerName: "Anna Becker",
    });
    const [power, phone] = legacyContractsOf("c-legacy");
    expect(power).toMatchObject({
      customerId: "c-legacy",
      customerName: "Anna Becker",
      division: "electricity",
      tariffName: "Strom Klassik",
      tariffOption: "oeko",
      productId: "strom-klassik",
      productVersion: 1,
      monthlyInstallmentCent: 8700,
      legacyContractId: "SV-778812",
      startReading: { value: 18234, readAt: "2026-04-03" },
    });
    expect(power?.installmentMinCent).toBeLessThanOrEqual(8700);
    expect(power?.installmentMaxCent).toBeGreaterThanOrEqual(8700);
    expect(phone).toMatchObject({
      division: "mobile",
      productId: "mobil-flex",
      dataVolumeMb: 20480,
      monthlyInstallmentCent: 1999,
    });
    expect(f.table.partition("TENANT#owner#CONTRACTS")).toHaveLength(2);
    const events = published();
    expect(events.map((e) => e.type)).toEqual(["ContractChanged", "ContractChanged"]);
    const payload = ContractChanged.detail.parse(events[0]?.detail).payload;
    expect(payload.initiatedBy).toBe("system");
    expect(payload.contract.customerId).toBe("c-legacy");
    expect(payload.contract.estimatedAnnualConsumption).toBe(power?.estimatedAnnualConsumption);
    expect(payload.contract.estimatedAnnualConsumption).toBeGreaterThan(0);
  });

  it("is idempotent across sources and redeliveries (same contract and event ids)", async () => {
    await worker(envelope("kundenportal.identity", "LegacyAccountMigrated", migrated));
    const first = published().map((e) => e.detail.eventId);
    f.ebMock.resetHistory();
    await worker(envelope("kundenportal.migration", "LegacyAccountMigrated", migrated));
    expect(published().map((e) => e.detail.eventId)).toEqual(first);
    expect(legacyContractsOf("c-legacy")).toHaveLength(2);
  });

  it("moves the contracts of a linked account to the confirming customer", async () => {
    f.table.put({
      PK: "TENANT#owner#SUBJ#sub-bernd",
      SK: "CONTRACTS",
      customerId: "c-bernd",
      customerName: "Bernd Kurz",
    });
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
    expect(legacyContractsOf("c-bernd")).toEqual([
      expect.objectContaining({
        customerId: "c-bernd",
        customerName: "Bernd Kurz",
        division: "mobile",
        legacyContractId: "MOB-812233",
      }),
    ]);
  });
});

describe("MigratedAccountsRemoved", () => {
  const removed = envelope("kundenportal.migration", "MigratedAccountsRemoved", {
    eventId: "8b3e3f86-ac6e-4e77-9c5b-7f0c6c2e4e33",
    tenantId: "owner",
    occurredAt: "2026-09-30T14:00:00.000Z",
    correlationId: "req-reset",
    payload: {
      reason: "demo-reset",
      accounts: [
        { subject: "sub-1", customerId: "c-1" },
        { subject: "sub-anna", customerId: "c-legacy" },
      ],
    },
  });

  it("deletes contracts, history, directory entries and identity links, also when redelivered", async () => {
    await worker(customerRegistered());
    await worker(envelope("kundenportal.identity", "LegacyAccountMigrated", migrated));
    await worker(meterReading(reading(19800)));
    const foreign = { PK: "TENANT#owner#CUST#c-1", SK: "PROFILE", displayName: "Anna" };
    f.table.put(foreign);
    expect(f.table.partition("TENANT#owner#CUST#c-1", "HISTORY#")).toHaveLength(1);

    await worker(removed);
    expect(f.table.partition("TENANT#owner#CUST#c-1", "CONTRACT#")).toEqual([]);
    expect(f.table.partition("TENANT#owner#CUST#c-1", "HISTORY#")).toEqual([]);
    expect(f.table.partition("TENANT#owner#CUST#c-legacy")).toEqual([]);
    expect(f.table.partition("TENANT#owner#CONTRACTS")).toEqual([]);
    expect(f.table.get("TENANT#owner#SUBJ#sub-1", "CONTRACTS")).toBeUndefined();
    // Other domains' items in the customer's partition stay.
    expect(f.table.get(foreign.PK, foreign.SK)).toEqual(foreign);

    f.ebMock.resetHistory();
    await expect(worker(removed)).resolves.toBeUndefined();
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
    expect(f.dbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  it("sends readings for unknown contracts to the DLQ", async () => {
    await expect(worker(meterReading(reading(19800)))).rejects.toThrow();
  });

  it("throws on infrastructure errors so Lambda retries", async () => {
    f.dbMock.on(TransactWriteCommand).rejects(new Error("throttled"));
    await expect(worker(customerRegistered())).rejects.toThrow();
  });
});
