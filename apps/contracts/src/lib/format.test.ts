import type { Contract } from "@kundenportal/api-contract";
import { describe, expect, it } from "vitest";
import { de } from "@/i18n/de";
import { contractFacts } from "./facts";
import { formatWholeEuro, shortContractId, unitLabel } from "./format";

const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

describe("format", () => {
  it("leaves out the cents of whole euro amounts", () => {
    expect(plain(formatWholeEuro(6000, "de"))).toBe("60 €");
    expect(plain(formatWholeEuro(1999, "de"))).toBe("19,99 €");
    expect(formatWholeEuro(12000, "en")).toBe("€120");
  });

  it("shortens the contract id to its first block and writes m³", () => {
    expect(shortContractId("6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11")).toBe("6F1C1F64");
    expect(unitLabel("m3")).toBe("m³");
    expect(unitLabel("kWh")).toBe("kWh");
  });
});

describe("contractFacts", () => {
  const electricity: Contract = {
    contractId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
    division: "electricity",
    tariffName: "Strom Klassik",
    tariffOption: "standard",
    tariffOptions: ["standard", "oeko"],
    monthlyInstallmentCent: 8700,
    installmentAdjustable: true,
    installmentMinCent: 6000,
    installmentMaxCent: 12000,
    meterNumber: "1ESY 1160 4471 23",
    unit: "kWh",
    workPriceCent: 32,
    monthlyPriceCent: 1290,
    estimatedAnnualConsumption: 2650,
    startDate: "2019-03-01",
    minimumTermMonths: 24,
    minimumTermEndDate: "2027-12-31",
    status: "active",
    updatedAt: "2026-10-01T10:00:00.000Z",
  };
  const text = (contract: Contract) =>
    contractFacts(contract, de, "de").map(
      (fact) =>
        `${String(fact.term)}: ${
          typeof fact.description === "string" ? plain(fact.description) : "<node>"
        }`,
    );

  it("lists a metered contract's facts in the mockup's order", () => {
    expect(text(electricity)).toEqual([
      "Vertragsnummer: <node>",
      "Tarifoption: Standard",
      "Monatlicher Abschlag: 87,00 €",
      "Grundpreis pro Monat: 12,90 €",
      "Arbeitspreis: 32 ct pro kWh",
      "Zählernummer: <node>",
      "Geschätzter Jahresverbrauch: 2.650 kWh",
      "Vertragsbeginn: 01.03.2019 · 24 Monate",
      "Laufzeitende: 31.12.2027",
    ]);
  });

  it("shows the monthly price and data volume of a mobile contract", () => {
    const {
      meterNumber: _m,
      unit: _u,
      workPriceCent: _w,
      estimatedAnnualConsumption: _e,
      ...rest
    } = electricity;
    const mobile: Contract = {
      ...rest,
      division: "mobile",
      tariffOption: "20gb",
      installmentAdjustable: false,
      monthlyInstallmentCent: 1999,
      monthlyPriceCent: 1999,
      dataVolumeMb: 20480,
    };
    expect(text(mobile)).toEqual([
      "Vertragsnummer: <node>",
      "Tarifoption: 20 GB",
      "Monatspreis: 19,99 €",
      "Datenvolumen pro Monat: 20 GB",
      "Vertragsbeginn: 01.03.2019 · 24 Monate",
      "Laufzeitende: 31.12.2027",
    ]);
  });
});
