import type { Contract } from "@kundenportal/api-contract";
import { describe, expect, it } from "vitest";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import {
  billingPeriod,
  changeDelta,
  formatVolume,
  gigabytes,
  isImplausible,
  monthLabel,
  monthRange,
  monthlyCost,
  selectedTab,
  tabContracts,
  unitLabel,
} from "./consumption";

const plain = (text: unknown) => String(text).replace(/[\u00a0\u202f]/g, " ");

describe("chart labels", () => {
  const months = ["2025-10", "2025-11", "2026-09"].map((month) => ({ month }));

  it("names the months briefly in both languages", () => {
    expect(monthLabel("2025-10", de.months)).toBe("Okt");
    expect(monthLabel("2026-03", de.months)).toBe("Mär");
    expect(monthLabel("2025-10", en.months)).toBe("Oct");
    expect(monthLabel("garbage", de.months)).toBe("garbage");
  });

  it("spans the first to the last month", () => {
    expect(monthRange(months, de.months, de.chart.range)).toBe("Okt 2025 – Sep 2026");
    expect(monthRange([], de.months, de.chart.range)).toBe("");
  });
});

describe("key figures", () => {
  it("shows the change to the previous year with a real minus, lower is good", () => {
    expect(changeDelta(-4.1, "de", de.kpi.change)).toEqual({
      text: "−4,1 % zum Vorjahr",
      tone: "good",
    });
    expect(changeDelta(3.25, "de", de.kpi.change)).toEqual({
      text: "+3,3 % zum Vorjahr",
      tone: "neutral",
    });
    expect(changeDelta(0, "de", de.kpi.change).text).toBe("0,0 % zum Vorjahr");
    expect(changeDelta(-4.1, "en", en.kpi.change).text).toBe("−4.1 % vs. previous year");
  });

  it("estimates the cost of an average month at the unit price", () => {
    expect(plain(monthlyCost(220, 32.4, "de"))).toBe("71 €");
    expect(plain(monthlyCost(220, 32, "de"))).toBe("70 €");
    expect(unitLabel("m3")).toBe("m³");
  });
});

describe("tabs", () => {
  const contract = (id: string, division: Contract["division"], extra: Partial<Contract>) =>
    ({ contractId: id, division, ...extra }) as Contract;
  const contracts = [
    contract("m", "mobile", { dataVolumeMb: 20480 }),
    contract("i", "internet", {}),
    contract("e", "electricity", { meterNumber: "1ESY", unit: "kWh" }),
    contract("g", "gas", { meterNumber: "7GMT", unit: "m3" }),
  ];

  it("puts the metered contracts first, then mobile, and leaves out the rest", () => {
    expect(tabContracts(contracts).map((item) => item.contractId)).toEqual(["e", "g", "m"]);
  });

  it("selects the tab named by ?vertrag=, else the first", () => {
    expect(selectedTab(["e", "g", "m"], "g")).toBe("g");
    expect(selectedTab(["e", "g", "m"], ["m", "e"])).toBe("m");
    expect(selectedTab(["e", "g", "m"], "unknown")).toBe("e");
    expect(selectedTab(["e", "g", "m"], undefined)).toBe("e");
    expect(selectedTab([], "e")).toBeUndefined();
  });
});

describe("plausibility hint", () => {
  const range = { min: 48250, max: 48400, at: "2026-10-01" };

  it("warns outside the expected range for today only", () => {
    expect(isImplausible("48300", "2026-10-01", range)).toBe(false);
    expect(isImplausible("48500", "2026-10-01", range)).toBe(true);
    expect(isImplausible("48220,5", "2026-10-01", range)).toBe(true);
    // Another date or no range: the API's range does not apply.
    expect(isImplausible("48500", "2026-09-30", range)).toBe(false);
    expect(isImplausible("48500", "2026-10-01", undefined)).toBe(false);
    // Nothing (valid) typed yet: the form's own checks speak.
    expect(isImplausible("", "2026-10-01", range)).toBe(false);
    expect(isImplausible("abc", "2026-10-01", range)).toBe(false);
  });
});

describe("data volume", () => {
  it("writes the billing period and the used gigabytes", () => {
    expect(billingPeriod("2026-10", "de")).toBe("01.–31.10.2026");
    expect(billingPeriod("2026-02", "de")).toBe("01.–28.02.2026");
    expect(gigabytes(12698, "de")).toBe("12,4");
    expect(gigabytes(12698, "en")).toBe("12.4");
    expect(plain(formatVolume(12698, "de"))).toBe("12,4 GB");
    expect(plain(formatVolume(20480, "de"))).toBe("20 GB");
    expect(plain(formatVolume(500, "de"))).toBe("500 MB");
  });
});
