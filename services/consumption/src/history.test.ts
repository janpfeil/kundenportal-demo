import type { MeterUnit } from "@kundenportal/events";
import { describe, expect, it } from "vitest";
import {
  addMonthsToDate,
  annualConsumption,
  type ConsumptionHistory,
  consumptionHistory,
  defaultAnnualConsumption,
  type HistoryInput,
  MONTHLY_SHARES,
  readingSchedule,
} from "./history.js";
import type { MeterReading } from "./model.js";

const contractId = "0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const now = new Date("2026-10-01T08:00:00.000Z");

const reading = (
  value: number,
  readAt: string,
  submittedAt = `${readAt}T10:00:00.000Z`,
  unit: MeterUnit = "kWh",
): MeterReading => ({
  readingId: `${Date.parse(submittedAt).toString(36)}-r`,
  value,
  unit,
  readAt,
  source: "customer",
  submittedAt,
});

const history = (input: Partial<HistoryInput>): ConsumptionHistory =>
  consumptionHistory({
    contractId,
    division: "electricity",
    unit: "kWh",
    readings: [],
    estimatedAnnualConsumption: 2400,
    now,
    ...input,
  });

const month = (h: ConsumptionHistory, m: string) => {
  const found = h.months.find((entry) => entry.month === m);
  if (!found) throw new Error(`no ${m}`);
  return found;
};
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("load profiles", () => {
  it.each(Object.entries(MONTHLY_SHARES))("%s shares sum to 1", (_division, shares) => {
    expect(shares).toHaveLength(12);
    expect(sum([...shares])).toBeCloseTo(1, 12);
  });
});

describe("consumptionHistory", () => {
  it("estimates every month from the annual consumption when only the start reading exists", () => {
    const start = { ...reading(18234, "2026-04-03"), source: "contract-start" as const };
    const h = history({ readings: [start] });

    expect(h.months.map((m) => m.month)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(h.months.every((m) => m.basis === "estimate" && m.previousBasis === "estimate")).toBe(
      true,
    );
    // H0: December 10.3 %, June 7 % of 2 400 kWh.
    expect(month(h, "2025-12").value).toBe(247);
    expect(month(h, "2026-06").value).toBe(168);
    expect(month(h, "2026-06").previousYear).toBe(168);
    expect(Math.abs(h.total - 2400)).toBeLessThanOrEqual(6);
    expect(h.previousTotal).toBe(h.total);
    expect(h.changePercent).toBe(0);
    expect(h.averagePerMonth).toBe(Math.round(h.total / 12));
    expect(h.latestReading).toEqual(start);
  });

  it("follows the heating profile for gas", () => {
    const h = history({ division: "gas", unit: "m3", estimatedAnnualConsumption: 1200 });
    expect(month(h, "2026-01").value).toBe(204);
    expect(month(h, "2026-07").value).toBe(18);
  });

  it("spreads a span over its months with the profile and keeps its sum", () => {
    const h = history({ readings: [reading(1000, "2025-01-01"), reading(2000, "2025-07-01")] });

    const half = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"].map((m) =>
      month(h, m),
    );
    expect(half.every((m) => m.previousBasis === "readings")).toBe(true);
    expect(Math.abs(sum(half.map((m) => m.previousYear)) - 1000)).toBeLessThanOrEqual(3);
    // Shape of H0 within the span: January > March > February > April > May > June.
    const [jan, feb, mar, apr, may, jun] = half.map((m) => m.previousYear);
    expect(jan).toBe(198);
    expect(jun).toBe(140);
    expect([jan, mar, feb, apr, may, jun]).toEqual(
      [jan, mar, feb, apr, may, jun].toSorted((a = 0, b = 0) => b - a),
    );
    // Outside the span: estimated.
    expect(month(h, "2026-07").previousBasis).toBe("estimate");
    expect(month(h, "2026-07").basis).toBe("estimate");
  });

  it("counts a partly covered month as readings when at most half of it is estimated", () => {
    // 16 days from readings (500 kWh), 15 estimated from 2 400 kWh a year (less than 30
    // days between the readings, so the contract's estimate stays).
    const h = history({ readings: [reading(100, "2026-03-01"), reading(600, "2026-03-17")] });
    expect(month(h, "2026-03")).toMatchObject({ value: 603, basis: "readings" });
    expect(month(h, "2026-02")).toMatchObject({ value: 209, basis: "estimate" });

    const later = history({ readings: [reading(100, "2026-03-01"), reading(600, "2026-03-16")] });
    expect(month(later, "2026-03")).toMatchObject({ value: 610, basis: "estimate" });
  });

  it("rounds m³ to one decimal", () => {
    const h = history({
      division: "water",
      unit: "m3",
      readings: [
        reading(50, "2025-10-01", undefined, "m3"),
        reading(150.123, "2026-10-01", undefined, "m3"),
      ],
    });
    expect(h.unit).toBe("m3");
    expect(h.months.every((m) => m.basis === "readings")).toBe(true);
    for (const value of h.months.flatMap((m) => [m.value, m.previousYear])) {
      expect(Math.abs(value * 10 - Math.round(value * 10))).toBeLessThan(1e-9);
    }
    expect(Math.abs(h.total - 100.1)).toBeLessThanOrEqual(0.6);
    expect(month(h, "2026-07").value).toBeGreaterThan(month(h, "2026-02").value);
    // A reading today: due again in three months, a second one today is plausible.
    expect(h).toMatchObject({ nextReadingDue: "2027-01-01", readingDue: false });
    expect(h.plausibleRange).toEqual({ min: 150.123, max: 150.7, at: "2026-10-01" });
  });

  it("ignores spans whose value went down and counts equal values as no consumption", () => {
    const h = history({
      readings: [
        reading(5000, "2025-10-01"),
        reading(4000, "2026-01-01"), // meter exchanged
        reading(4000, "2026-04-01"),
        reading(4300, "2026-07-01"),
      ],
    });
    expect(month(h, "2025-12")).toMatchObject({ value: 247, basis: "estimate" });
    expect(month(h, "2026-02")).toMatchObject({ value: 0, basis: "readings" });
    const summer = ["2026-04", "2026-05", "2026-06"].map((m) => month(h, m));
    expect(summer.every((m) => m.basis === "readings")).toBe(true);
    expect(Math.abs(sum(summer.map((m) => m.value)) - 300)).toBeLessThanOrEqual(2);
  });

  it("uses the last submitted reading of a day", () => {
    const h = history({
      readings: [
        reading(500, "2026-04-01", "2026-04-01T11:00:00.000Z"),
        reading(100, "2026-01-01"),
        reading(400, "2026-04-01", "2026-04-01T10:00:00.000Z"),
      ],
    });
    const quarter = ["2026-01", "2026-02", "2026-03"].map((m) => month(h, m).value);
    expect(Math.abs(sum(quarter) - 400)).toBeLessThanOrEqual(2);
    expect(h.latestReading?.value).toBe(500);
  });

  it("compares with the year before and omits the change without previous consumption", () => {
    const h = history({
      readings: [
        reading(0, "2024-10-01"),
        reading(1000, "2025-10-01"),
        reading(1900, "2026-10-01"),
      ],
    });
    expect(h.months.every((m) => m.basis === "readings" && m.previousBasis === "readings")).toBe(
      true,
    );
    expect(Math.abs(h.total - 900)).toBeLessThanOrEqual(6);
    expect(Math.abs(h.previousTotal - 1000)).toBeLessThanOrEqual(6);
    expect(h.changePercent).toBe(
      Math.round(((h.total - h.previousTotal) / h.previousTotal) * 1000) / 10,
    );
    expect(h.changePercent).toBeCloseTo(-10, 0);

    const fresh = history({
      readings: [reading(0, "2024-10-01"), reading(0, "2025-10-01"), reading(1000, "2026-10-01")],
    });
    expect(fresh.previousTotal).toBe(0);
    expect(fresh).not.toHaveProperty("changePercent");
  });

  it("takes the current month from the German date", () => {
    // 00:30 in Germany on 1 October is still 30 September in UTC.
    const october = history({ now: new Date("2026-10-01T00:30:00+02:00") });
    expect(october.months[0]?.month).toBe("2025-10");
    expect(october.months.at(-1)?.month).toBe("2026-09");

    const september = history({ now: new Date("2026-09-30T23:30:00+02:00") });
    expect(september.months.at(-1)?.month).toBe("2026-08");

    const winter = history({
      now: new Date("2026-11-01T00:30:00+01:00"),
      readings: [reading(10000, "2026-10-31")],
    });
    expect(winter.months.at(-1)?.month).toBe("2026-10");
    expect(winter.plausibleRange?.at).toBe("2026-11-01");
  });

  it("gives the plausible range of a reading taken today", () => {
    // Expected since 1 July: 2 400 × (7.2 + 7.3 + 7.5) % = 528 kWh.
    const h = history({ readings: [reading(10000, "2026-07-01")] });
    expect(h.plausibleRange).toEqual({ min: 10176, max: 11598, at: "2026-10-01" });

    // A reading on the same day: the latest value up to two days of average consumption.
    const same = history({ readings: [reading(10000, "2026-10-01")] });
    expect(same.plausibleRange).toEqual({ min: 10000, max: 10014, at: "2026-10-01" });
  });

  it("has neither latest reading nor range without readings, and asks for one", () => {
    const h = history({ readings: [] });
    expect(h).not.toHaveProperty("latestReading");
    expect(h).not.toHaveProperty("plausibleRange");
    expect(h).toMatchObject({ nextReadingDue: "2026-10-15", readingDue: true });
  });
});

describe("readingSchedule", () => {
  const latestAt = (readAt: string) => readingSchedule("2026-10-01", reading(1, readAt));

  it("asks for a reading three months after the latest one", () => {
    expect(latestAt("2026-07-20")).toMatchObject({
      nextReadingDue: "2026-10-20",
      readingDue: false,
    });
    expect(latestAt("2026-07-16")).toMatchObject({
      nextReadingDue: "2026-10-16",
      readingDue: false,
    });
    expect(latestAt("2026-07-15")).toMatchObject({
      nextReadingDue: "2026-10-15",
      readingDue: true,
    });
    expect(latestAt("2026-07-01")).toMatchObject({
      nextReadingDue: "2026-10-01",
      readingDue: true,
    });
  });

  it("gives 14 days once the regular date has passed", () => {
    expect(latestAt("2026-06-30")).toMatchObject({
      nextReadingDue: "2026-10-15",
      readingDue: true,
    });
    expect(readingSchedule("2026-10-01", undefined)).toEqual({
      nextReadingDue: "2026-10-15",
      readingDue: true,
    });
  });

  it("clamps to the end of the month", () => {
    expect(addMonthsToDate("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsToDate("2027-11-30", 3)).toBe("2028-02-29");
    expect(addMonthsToDate("2026-10-31", 3)).toBe("2027-01-31");
  });
});

describe("annualConsumption", () => {
  it("falls back to the contract's estimate and then to the division's default", () => {
    expect(annualConsumption("electricity", "kWh", [], 3100)).toBe(3100);
    expect(annualConsumption("electricity", "kWh", [], undefined)).toBe(2500);
    expect(annualConsumption("gas", "m3", [], undefined)).toBe(1200);
    expect(defaultAnnualConsumption("gas", "kWh")).toBe(12000);
    expect(annualConsumption("water", "m3", [], undefined)).toBe(100);
  });

  it("extrapolates readings at least 30 days apart with the load profile", () => {
    const readings = [reading(1000, "2025-01-01"), reading(2000, "2025-07-01")];
    // January to June hold 49.9 % of the H0 year.
    expect(annualConsumption("electricity", "kWh", readings, 3100)).toBeCloseTo(1000 / 0.499, 6);
    const close = [reading(1000, "2025-06-10"), reading(2000, "2025-07-01")];
    expect(annualConsumption("electricity", "kWh", close, 3100)).toBe(3100);
  });

  it("extrapolates over the last year when the readings reach further back", () => {
    const readings = [
      reading(0, "2023-10-01"),
      reading(9000, "2025-10-01"),
      reading(12000, "2026-10-01"),
    ];
    expect(annualConsumption("electricity", "kWh", readings, undefined)).toBeCloseTo(3000, 6);
  });
});
