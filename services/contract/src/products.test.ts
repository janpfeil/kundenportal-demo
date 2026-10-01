import { describe, expect, it } from "vitest";
import {
  currentVersion,
  DEFAULT_PRODUCT_IDS,
  defaultProduct,
  operatorProductView,
  optionProblem,
  type ProductRecord,
  productSlug,
  productView,
  STATUS_MOVES,
  staticVersion,
} from "./products.js";

const at = "2026-10-02T10:00:00.000Z";

describe("default catalogue", () => {
  it("has one product per division with stable ids derived from the tariff names", () => {
    expect(DEFAULT_PRODUCT_IDS).toEqual({
      electricity: "strom-klassik",
      gas: "gas-komfort",
      water: "wasser-basis",
      internet: "internet-zuhause",
      mobile: "mobil-flex",
    });
    expect(productSlug("Strom Grün & Günstig")).toBe("strom-gruen-guenstig");
  });

  it("keeps the tariffs' option ids and prices and labels them in German", () => {
    const power = defaultProduct("electricity", at);
    expect(power).toMatchObject({
      status: "active",
      unit: "kWh",
      minimumTermMonths: 12,
      noticePeriodMonths: 1,
      revision: 1,
    });
    expect(power.versions).toEqual([
      {
        version: 1,
        validFrom: "2026-01-01",
        createdAt: at,
        options: [
          { optionId: "standard", label: "Standard", monthlyPriceCent: 1200, workPriceCent: 32 },
          { optionId: "oeko", label: "Ökostrom", monthlyPriceCent: 1200, workPriceCent: 34 },
        ],
      },
    ]);
    expect(defaultProduct("mobile", at).versions[0]?.options[1]).toEqual({
      optionId: "20gb",
      label: "20 GB",
      monthlyPriceCent: 1999,
      dataVolumeMb: 20480,
    });
    expect(defaultProduct("internet", at)).not.toHaveProperty("unit");
  });

  it("knows version 1 of a default product without reading it", () => {
    expect(staticVersion("gas-komfort", 1)?.options.map((o) => o.optionId)).toEqual([
      "standard",
      "klima",
    ]);
    expect(staticVersion("gas-komfort", 2)).toBeUndefined();
    expect(staticVersion("gas-spezial", 1)).toBeUndefined();
  });
});

describe("price versions", () => {
  const version = (n: number, validFrom: string, price: number) => ({
    version: n,
    validFrom,
    createdAt: at,
    options: [
      { optionId: "standard", label: "Standard", monthlyPriceCent: price, workPriceCent: 30 },
    ],
  });
  const product: ProductRecord = {
    ...defaultProduct("water", at),
    versions: [
      version(1, "2026-01-01", 800),
      version(2, "2026-10-02", 900),
      version(3, "2026-12-01", 950),
    ],
  };

  it("gives new orders the highest version valid today; later ones wait for their day", () => {
    expect(currentVersion(product, "2026-10-01")?.version).toBe(1);
    expect(currentVersion(product, "2026-10-02")?.version).toBe(2);
    expect(currentVersion(product, "2026-12-01")?.version).toBe(3);
    expect(productView(product, "2026-10-02")).toMatchObject({
      version: 2,
      options: [expect.objectContaining({ monthlyPriceCent: 900 })],
    });
  });

  it("shows the first upcoming version of a product not valid yet", () => {
    const upcoming = { ...product, versions: [version(1, "2026-11-01", 800)] };
    expect(currentVersion(upcoming, "2026-10-02")).toBeUndefined();
    expect(productView(upcoming, "2026-10-02").version).toBe(1);
  });

  it("lists every version newest first with running contracts per version for the operator", () => {
    const view = operatorProductView(product, "2026-10-02", { 1: 4, 2: 1 });
    expect(view.versions?.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(view.contractCount).toEqual({ "1": 4, "2": 1, "3": 0 });
  });
});

describe("status moves", () => {
  it("allow draft → active → retiring → archived, back from retiring, and discarding a draft", () => {
    expect(STATUS_MOVES).toEqual({
      draft: ["active", "archived"],
      active: ["retiring"],
      retiring: ["active", "archived"],
      archived: [],
    });
  });
});

describe("options per division", () => {
  const option = { optionId: "a", label: "A", monthlyPriceCent: 1000 };
  it.each([
    ["electricity", [option], "Arbeitspreis fehlt"],
    ["internet", [{ ...option, workPriceCent: 30 }], "Arbeitspreis gibt es nur"],
    ["internet", [{ ...option, dataVolumeMb: 1024 }], "Datenvolumen gibt es nur"],
    ["mobile", [{ ...option, bandwidthMbit: 100 }], "Bandbreite gibt es nur"],
    ["mobile", [option, option], "eigene Kennung"],
  ] as const)("rejects %s options %j", (division, options, problem) => {
    expect(optionProblem(division, [...options])).toContain(problem);
  });

  it("accepts fitting options", () => {
    expect(optionProblem("gas", [{ ...option, workPriceCent: 11.5 }])).toBeUndefined();
    expect(optionProblem("mobile", [{ ...option, dataVolumeMb: 5120 }])).toBeUndefined();
  });
});
