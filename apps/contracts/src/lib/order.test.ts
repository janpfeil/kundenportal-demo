import { describe, expect, it } from "vitest";
import { de } from "@/i18n/de";
import {
  type OrderInput,
  checkOrder,
  latestStart,
  orderProblem,
  parseContractOrder,
  parseReading,
} from "./order";
import {
  type Product,
  groupByDivision,
  monthsText,
  optionInfo,
  optionPrice,
  pickOption,
} from "./products";

const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

function product(overrides: Partial<Product> = {}): Product {
  return {
    productId: "strom-oeko",
    division: "electricity",
    name: "Öko-Strom",
    description: "Ökostrom",
    status: "active",
    unit: "kWh",
    minimumTermMonths: 12,
    noticePeriodMonths: 1,
    version: 1,
    options: [
      { optionId: "standard", label: "Standard", monthlyPriceCent: 1200, workPriceCent: 32.4 },
      { optionId: "plus", label: "Plus", monthlyPriceCent: 1500, workPriceCent: 30.9 },
    ],
    updatedAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

const TODAY = "2026-10-02";
const input = (overrides: Partial<OrderInput> = {}): OrderInput => ({
  optionId: "standard",
  startDate: TODAY,
  meterNumber: "1EMH0012345678",
  startReading: "12345,5",
  consent: true,
  ...overrides,
});

describe("catalogue", () => {
  it("groups active products by division in the fixed order and leaves empty ones out", () => {
    const mobile = product({ productId: "mobil", division: "mobile", name: "Mobil" });
    const gas = product({ productId: "gas", division: "gas", name: "Gas" });
    const retiring = product({ productId: "alt", division: "water", status: "retiring" });
    const groups = groupByDivision([mobile, product(), gas, retiring]);
    expect(groups.map((group) => group.division)).toEqual(["electricity", "gas", "mobile"]);
    expect(groups[0]?.products.map((item) => item.productId)).toEqual(["strom-oeko"]);
  });

  it("shows base and unit price of metered options", () => {
    const [standard] = product().options;
    if (!standard) throw new Error("fixture without options");
    const price = optionPrice(standard, product(), "de", de.prices);
    expect(plain(price.amount)).toBe("12,00 €");
    expect(price.amountLabel).toBe("Grundpreis / Monat");
    expect(price.lines).toEqual([{ term: "Arbeitspreis", value: "32,4 ct/kWh" }]);
  });

  it("shows the monthly price with bandwidth or data volume otherwise", () => {
    const internet = product({ division: "internet" });
    const fiber = optionPrice(
      { optionId: "250", label: "250", monthlyPriceCent: 3999, bandwidthMbit: 250 },
      internet,
      "de",
      de.prices,
    );
    expect(fiber.amountLabel).toBe("Monatspreis");
    expect(fiber.lines).toEqual([{ term: "Bandbreite", value: "250 Mbit/s" }]);
    const mobile = optionPrice(
      { optionId: "20gb", label: "20 GB", monthlyPriceCent: 1499, dataVolumeMb: 20480 },
      product({ division: "mobile" }),
      "de",
      de.prices,
    );
    expect(plain(mobile.lines[0]?.value ?? "")).toBe("20 GB");
  });

  it("gives the change form the option names and short prices", () => {
    expect(optionInfo(product(), "de", de.prices)).toEqual({
      standard: { label: "Standard", price: "32,4 ct/kWh" },
      plus: { label: "Plus", price: "30,9 ct/kWh" },
    });
  });

  it("preselects the requested option, else the first", () => {
    expect(pickOption(product(), "plus")?.optionId).toBe("plus");
    expect(pickOption(product(), ["plus"])?.optionId).toBe("plus");
    expect(pickOption(product(), "gibt-es-nicht")?.optionId).toBe("standard");
  });

  it("writes durations in months", () => {
    expect(monthsText(0, de.catalogue)).toBe("keine");
    expect(monthsText(1, de.catalogue)).toBe("1 Monat");
    expect(monthsText(24, de.catalogue)).toBe("24 Monate");
  });
});

describe("checkOrder", () => {
  it("builds the order of a metered product with meter number and reading", () => {
    expect(checkOrder(input(), product(), TODAY)).toEqual({
      ok: true,
      order: {
        productId: "strom-oeko",
        optionId: "standard",
        startDate: TODAY,
        meterNumber: "1EMH0012345678",
        startReading: 12345.5,
        consent: true,
      },
    });
  });

  it("needs meter number and reading for electricity, gas and water", () => {
    const check = checkOrder(input({ meterNumber: " ", startReading: "" }), product(), TODAY);
    expect(check).toEqual({
      ok: false,
      errors: { meterNumber: "meterEmpty", startReading: "readingEmpty" },
    });
    expect(
      checkOrder(input({ meterNumber: "12", startReading: "-5" }), product(), TODAY),
    ).toMatchObject({ errors: { meterNumber: "meterFormat", startReading: "readingFormat" } });
  });

  it("does not ask for a meter for internet and mobile", () => {
    const mobile = product({
      division: "mobile",
      options: [{ optionId: "20gb", label: "20 GB", monthlyPriceCent: 1499 }],
    });
    expect(
      checkOrder(input({ optionId: "20gb", meterNumber: "", startReading: "" }), mobile, TODAY),
    ).toEqual({
      ok: true,
      order: { productId: "strom-oeko", optionId: "20gb", startDate: TODAY, consent: true },
    });
  });

  it("allows a start between today and 90 days ahead", () => {
    expect(latestStart(TODAY)).toBe("2026-12-31");
    expect(checkOrder(input({ startDate: "2026-12-31" }), product(), TODAY).ok).toBe(true);
    for (const startDate of ["2026-10-01", "2027-01-01", "2026-13-01"]) {
      expect(checkOrder(input({ startDate }), product(), TODAY)).toMatchObject({
        errors: { startDate: "dateRange" },
      });
    }
    expect(checkOrder(input({ startDate: "" }), product(), TODAY)).toMatchObject({
      errors: { startDate: "dateEmpty" },
    });
  });

  it("needs the consent and an option of the product", () => {
    expect(checkOrder(input({ consent: false, optionId: "gold" }), product(), TODAY)).toMatchObject(
      { errors: { consent: "consent", optionId: "option" } },
    );
  });

  it("reads meter values with comma or point, no grouping, no negatives", () => {
    expect(parseReading("4711")).toBe(4711);
    expect(parseReading("4711,25")).toBe(4711.25);
    expect(parseReading("4.711")).toBe(4.711);
    expect(parseReading("1.234,5")).toBeUndefined();
    expect(parseReading("abc")).toBeUndefined();
    expect(parseReading("2000000000")).toBeUndefined();
  });
});

describe("parseContractOrder (route)", () => {
  const order = {
    productId: "strom-oeko",
    optionId: "standard",
    startDate: TODAY,
    meterNumber: "1EMH0012345678",
    startReading: 12345,
    consent: true,
  };

  it("passes a complete order through", () => {
    expect(parseContractOrder(order)).toEqual(order);
    const { meterNumber: _m, startReading: _r, ...plainOrder } = order;
    expect(parseContractOrder(plainOrder)).toEqual(plainOrder);
  });

  it.each([
    ["no consent", { ...order, consent: false }],
    ["an unknown field", { ...order, price: 0 }],
    ["a product id with a path", { ...order, productId: "../admin" }],
    ["a German date", { ...order, startDate: "02.10.2026" }],
    ["a reading as text", { ...order, startReading: "12345" }],
    ["a negative reading", { ...order, startReading: -1 }],
    ["a short meter number", { ...order, meterNumber: "12" }],
  ])("rejects %s", (_case, body) => {
    expect(parseContractOrder(body)).toBeUndefined();
  });

  it("maps the API's answers to messages", () => {
    expect(orderProblem(401)).toBe("session");
    expect(orderProblem(404)).toBe("unavailable");
    expect(orderProblem(409)).toBe("conflict");
    expect(orderProblem(422)).toBe("invalid");
    expect(orderProblem(502)).toBe("generic");
  });
});
