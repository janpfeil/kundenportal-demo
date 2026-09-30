import { describe, expect, it } from "vitest";
import { demoContracts } from "./contract.js";
import {
  addDays,
  addMonths,
  estimateAnnualConsumption,
  recommendedInstallment,
  tariffOption,
} from "./tariffs.js";

const eventId = "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11";

describe("installment rule", () => {
  it("adds base price and consumption, divides by twelve and rounds up to whole euros", () => {
    const electricity = tariffOption("electricity", "standard");
    if (!electricity) throw new Error("catalogue");
    // (2800 kWh × 32 ct + 12 × 1200 ct) / 12 = 8666.67 ct → 87 €
    expect(recommendedInstallment(2800, electricity)).toEqual({
      installmentCent: 8700,
      minCent: 6900,
      maxCent: 13100,
    });
  });

  it("extrapolates the consumption per day to a year, but not from short intervals", () => {
    const start = { value: 18234, readAt: "2026-04-03" };
    expect(estimateAnnualConsumption(start, { value: 19800, readAt: "2026-09-30" })).toBe(3176);
    expect(estimateAnnualConsumption(start, { value: 18300, readAt: "2026-04-20" })).toBe(
      undefined,
    );
    expect(estimateAnnualConsumption(start, { value: 1, readAt: "2026-09-30" })).toBe(undefined);
  });

  it("computes dates without time zone surprises", () => {
    expect(addDays("2026-09-30", -180)).toBe("2026-04-03");
    expect(addMonths("2026-04-03", 12)).toBe("2027-04-03");
  });
});

describe("demo contracts", () => {
  const contracts = demoContracts("c-1", eventId, "2026-09-30T12:00:00.000Z");

  it("gives electricity, gas and mobile with plausible values", () => {
    expect(contracts.map((c) => [c.division, c.monthlyInstallmentCent])).toEqual([
      ["electricity", 8700],
      ["gas", 12700],
      ["mobile", 1999],
    ]);
    expect(contracts[0]).toMatchObject({
      unit: "kWh",
      startDate: "2026-04-03",
      startReading: { value: 18234, readAt: "2026-04-03" },
    });
    expect(contracts[0]?.meterNumber).toMatch(/^1EMH00\d{8}$/);
    expect(contracts[1]?.meterNumber).toMatch(/^7GMT00\d{8}$/);
    expect(contracts[2]).toMatchObject({ dataVolumeMb: 20480 });
    expect(contracts[2]).not.toHaveProperty("meterNumber");
  });

  it("derives ids from the event, so a redelivery yields the same contracts", () => {
    const again = demoContracts("c-1", eventId, "2026-09-30T12:00:00.000Z");
    expect(again.map((c) => c.contractId)).toEqual(contracts.map((c) => c.contractId));
    expect(new Set(contracts.map((c) => c.contractId)).size).toBe(3);
  });
});
