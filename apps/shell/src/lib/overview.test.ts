import type { Contract, Notification } from "@kundenportal/api-contract";
import { describe, expect, it } from "vitest";
import {
  type ConsumptionHistory,
  cardPrice,
  contractCard,
  dueReading,
  longDate,
  messageDateTime,
  messageTime,
  meterTail,
  monthYear,
  newestFirst,
  paragraphs,
  passRing,
  quotaShare,
  selectMessage,
  volumePair,
} from "./overview";

/** Normalises the narrow no-break spaces Intl puts before units and currency signs. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

const contract = (overrides: Partial<Contract>): Contract => ({
  contractId: "c-strom",
  division: "electricity",
  tariffName: "Strom Klassik",
  tariffOption: "Standard",
  tariffOptions: ["Standard", "Öko"],
  monthlyInstallmentCent: 8700,
  installmentAdjustable: true,
  monthlyPriceCent: 1290,
  startDate: "2019-03-01",
  minimumTermMonths: 24,
  minimumTermEndDate: "2027-12-31",
  status: "active",
  updatedAt: "2026-09-01T00:00:00Z",
  meterNumber: "1ESY 1160 4471 23",
  unit: "kWh",
  ...overrides,
});

const months = (basis: "readings" | "estimate", values = [281, 296, 262, 238, 205, 186]) =>
  [...values, ...values].map((value, index) => ({
    month: `2025-${String(index + 1).padStart(2, "0")}`,
    value,
    previousYear: value,
    basis,
    previousBasis: basis,
  }));

const history = (overrides: Partial<ConsumptionHistory>): ConsumptionHistory => ({
  contractId: "c-strom",
  unit: "kWh",
  months: months("readings"),
  total: 2936,
  previousTotal: 2936,
  averagePerMonth: 245,
  nextReadingDue: "2026-10-15",
  readingDue: false,
  ...overrides,
});

const note = (id: string, createdAt: string, read = false): Notification => ({
  notificationId: id,
  kind: "info",
  title: `Nachricht ${id}`,
  body: "Text",
  createdAt,
  read,
});

describe("greeting date", () => {
  it("is today's long date in German time", () => {
    // 23:30 UTC on 30 September is already 1 October in Germany.
    const now = new Date("2026-09-30T23:30:00Z");
    expect(longDate(now, "de")).toBe("Donnerstag, 1. Oktober 2026");
    expect(longDate(now, "en")).toBe("Thursday, October 1, 2026");
  });

  it("gives month and year for 'Kunde seit'", () => {
    expect(monthYear("2019-03-04T10:00:00Z", "de")).toBe("März 2019");
    expect(monthYear("not a date", "de")).toBe("not a date");
  });
});

describe("reading-due banner", () => {
  const strom = contract({});
  const gas = contract({ contractId: "c-gas", division: "gas", tariffName: "Gas Komfort" });
  const mobile = contract({ contractId: "c-mobil", division: "mobile" });

  it("names the active metered contract whose reading is due first", () => {
    const histories = new Map([
      ["c-strom", history({ readingDue: true, nextReadingDue: "2026-10-15" })],
      ["c-gas", history({ contractId: "c-gas", readingDue: true, nextReadingDue: "2026-10-09" })],
    ]);
    expect(dueReading([strom, gas, mobile], histories)).toEqual({
      contractId: "c-gas",
      division: "gas",
      nextReadingDue: "2026-10-09",
    });
  });

  it("stays away when nothing is due, the contract ended or the history is missing", () => {
    expect(dueReading([strom], new Map([["c-strom", history({})]]))).toBeUndefined();
    expect(
      dueReading(
        [contract({ status: "terminated" })],
        new Map([["c-strom", history({ readingDue: true })]]),
      ),
    ).toBeUndefined();
    expect(dueReading([strom], new Map())).toBeUndefined();
  });
});

describe("contract cards", () => {
  const texts = { meter: "Zähler" };

  it("shows option and meter tail, the installment and a line from readings", () => {
    const card = contractCard(contract({}), undefined, texts, history({}));
    expect(card).toMatchObject({
      title: "Strom Klassik",
      sub: "Standard · Zähler …7123",
      priceKind: "installment",
      status: "active",
      trend: { kind: "sparkline", min: 186, max: 296, unit: "kWh" },
    });
    expect(meterTail("1ESY 1160 4471 23")).toBe("7123");
  });

  it("states the annual estimate when only estimates stand behind the months", () => {
    const gas = contract({ division: "gas", unit: "m3", estimatedAnnualConsumption: 980 });
    expect(
      contractCard(
        gas,
        undefined,
        texts,
        history({ unit: "m3", months: months("estimate"), total: 9800 }),
      ),
    ).toMatchObject({ trend: { kind: "estimate", annual: 9800, unit: "m³" } });
    // Without a history the contract's own estimate.
    expect(contractCard(gas, undefined, texts)).toMatchObject({
      trend: { kind: "estimate", annual: 980 },
    });
  });

  it("shows the phone number and the (demo) data usage for mobile contracts", () => {
    const mobile = contract({
      division: "mobile",
      tariffName: "Mobil 20 GB",
      tariffOption: "20 GB",
      monthlyInstallmentCent: 1999,
      dataVolumeMb: 20480,
    });
    const usage = {
      contractId: "c-mobil",
      month: "2026-10",
      includedMb: 20480,
      usedMb: 12698,
      usedPercent: 62,
      thresholdPercent: 80,
      asOf: "2026-10-01T09:00:00Z",
    };
    expect(contractCard(mobile, { phone: "+49 151 2345 6789" }, texts, undefined, usage)).toEqual(
      expect.objectContaining({
        sub: "+49 151 2345 6789",
        priceKind: "monthly",
        trend: { kind: "usage", usedMb: 12698, includedMb: 20480 },
      }),
    );
    expect(contractCard(mobile, {}, texts, undefined, undefined, () => "20 GB")).toMatchObject({
      sub: "20 GB",
      trend: { kind: "none" },
    });
  });

  it("formats prices and volumes as the mockup does", () => {
    expect(plain(cardPrice(8700, "de"))).toBe("87 €");
    expect(plain(cardPrice(1999, "de"))).toBe("19,99 €");
    expect(volumePair(12698, 20480, "de")).toEqual({ used: "12,4", included: "20", unit: "GB" });
    expect(volumePair(300, 500, "de")).toEqual({ used: "300", included: "500", unit: "MB" });
  });
});

describe("mailbox", () => {
  const items = [
    note("a", "2026-09-28T08:00:00Z", true),
    note("b", "2026-10-01T07:14:00Z"),
    note("c", "2026-09-30T15:00:00Z"),
  ];

  it("sorts newest first and opens the requested or else the newest message", () => {
    expect(newestFirst(items).map((item) => item.notificationId)).toEqual(["b", "c", "a"]);
    expect(selectMessage(items, "c")?.notificationId).toBe("c");
    expect(selectMessage(items, ["a", "b"])?.notificationId).toBe("a");
    expect(selectMessage(items, "unknown")?.notificationId).toBe("b");
    expect(selectMessage(items, undefined)?.notificationId).toBe("b");
    expect(selectMessage([], "a")).toBeUndefined();
  });

  it("shows the time today, 'gestern' and the day before that (German time)", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(messageTime("2026-10-01T07:14:00Z", now, "de", "gestern")).toBe("09:14");
    expect(messageTime("2026-09-30T15:00:00Z", now, "de", "gestern")).toBe("gestern");
    // 22:30 UTC on 29 September is 30 September in Germany: yesterday.
    expect(messageTime("2026-09-29T22:30:00Z", now, "de", "gestern")).toBe("gestern");
    expect(messageTime("2026-09-28T08:00:00Z", now, "de", "gestern")).toBe("28.09.");
    expect(messageTime("2026-09-28T08:00:00Z", now, "en", "yesterday")).toBe("Sep 28");
    expect(messageDateTime("2026-10-01T07:14:00Z", "de")).toBe("Do., 01.10.2026, 09:14");
  });

  it("splits a body into paragraphs", () => {
    expect(paragraphs("Guten Tag,\n\nIhr Stand ist da.\nGrüße")).toEqual([
      "Guten Tag,",
      "Ihr Stand ist da.",
      "Grüße",
    ]);
    expect(paragraphs("")).toEqual([]);
  });
});

describe("pass ring", () => {
  const now = Date.parse("2026-10-01T09:40:00Z");

  it("counts the hours left of the pass's duration", () => {
    expect(passRing("2026-10-02T16:40:00Z", 48, now)).toMatchObject({
      unit: "hours",
      amount: 31,
      max: 48,
      totalHours: 48,
    });
  });

  it("switches to minutes for the last hour and short test passes", () => {
    expect(passRing("2026-10-01T09:52:00Z", 48, now)).toMatchObject({
      unit: "minutes",
      amount: 12,
    });
    expect(passRing("2026-10-01T09:00:00Z", 48, now)).toMatchObject({
      unit: "minutes",
      amount: 0,
      value: 0,
    });
  });

  it("widens the scale when more is left than the current offer's duration", () => {
    expect(passRing("2026-10-04T09:40:00Z", 48, now)).toMatchObject({
      unit: "days",
      amount: 3,
      max: 72,
      totalHours: 72,
    });
    expect(passRing("2026-10-01T12:40:00Z", 2, now)).toMatchObject({
      unit: "hours",
      amount: 3,
      max: 3,
    });
  });

  it("rates quota shares in whole percent", () => {
    expect(quotaShare(812, 1000)).toBe(81);
    expect(quotaShare(1, 0)).toBe(0);
  });
});
