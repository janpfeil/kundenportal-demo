import { describe, expect, it } from "vitest";
import { product } from "@/test-fixtures";
import {
  EMPTY_OPTION,
  type ProductDraft,
  contractsOn,
  parsePriceVersionInput,
  parseProductInput,
  parseProductUpdate,
  runningContracts,
  statusMoves,
  validatePriceDraft,
  validateProductDraft,
} from "./products";

const TODAY = "2026-10-02";

const draft = (overrides: Partial<ProductDraft> = {}): ProductDraft => ({
  productId: "strom-oeko-24",
  division: "electricity",
  name: "Strom Öko 24",
  description: "Zwei Jahre Preisgarantie",
  minimumTermMonths: "24",
  noticePeriodMonths: "1",
  validFrom: "",
  options: [
    { ...EMPTY_OPTION, optionId: "standard", label: "Standard", monthly: "12,50", work: "33,9" },
  ],
  ...overrides,
});

describe("product status", () => {
  it("moves draft → active → retiring → archived, archiving only without contracts", () => {
    expect(statusMoves(product({ status: "draft", contractCount: {} }))).toEqual([
      { action: "publish" },
      { action: "archive" },
    ]);
    expect(statusMoves(product({ status: "active" }))).toEqual([{ action: "retire" }]);
    expect(statusMoves(product({ status: "retiring" }))).toEqual([
      { action: "reactivate" },
      { action: "archive", blocked: "contracts" },
    ]);
    expect(statusMoves(product({ status: "retiring", contractCount: { "1": 0 } }))).toEqual([
      { action: "reactivate" },
      { action: "archive" },
    ]);
    expect(statusMoves(product({ status: "archived" }))).toEqual([]);
    expect(runningContracts(product())).toBe(8);
    expect(contractsOn(product(), 2)).toBe(5);
    expect(contractsOn(product(), 3)).toBe(0);
  });
});

describe("product form", () => {
  it("turns a valid form into a ProductInput with cents", () => {
    const { value, errors } = validateProductDraft(draft({ validFrom: "2026-11-01" }), TODAY);
    expect(errors).toEqual({});
    expect(value).toEqual({
      productId: "strom-oeko-24",
      division: "electricity",
      name: "Strom Öko 24",
      description: "Zwei Jahre Preisgarantie",
      minimumTermMonths: 24,
      noticePeriodMonths: 1,
      validFrom: "2026-11-01",
      options: [
        { optionId: "standard", label: "Standard", monthlyPriceCent: 1250, workPriceCent: 33.9 },
      ],
    });
  });

  it("asks for the fields of the division: data volume for mobile, no work price", () => {
    const mobile = validateProductDraft(
      draft({
        division: "mobile",
        options: [
          { ...EMPTY_OPTION, optionId: "10gb", label: "10 GB", monthly: "14,99", volume: "10" },
          { ...EMPTY_OPTION, optionId: "20gb", label: "20 GB", monthly: "19,99" },
        ],
      }),
      TODAY,
    );
    expect(mobile.value).toBeUndefined();
    expect(mobile.errors).toEqual({ "options.1.volume": "required" });
    const internet = validateProductDraft(
      draft({
        division: "internet",
        options: [
          { ...EMPTY_OPTION, optionId: "250", label: "250", monthly: "44,99", bandwidth: "250" },
        ],
      }),
      TODAY,
    );
    expect(internet.value?.options).toEqual([
      { optionId: "250", label: "250", monthlyPriceCent: 4499, bandwidthMbit: 250 },
    ]);
  });

  it("marks every problem by field", () => {
    const { value, errors } = validateProductDraft(
      draft({
        productId: "neu",
        division: "",
        name: "X",
        minimumTermMonths: "48",
        noticePeriodMonths: "",
        validFrom: "2026-09-30",
        options: [],
      }),
      TODAY,
    );
    expect(value).toBeUndefined();
    expect(errors).toEqual({
      productId: "pattern",
      division: "required",
      name: "length",
      minimumTermMonths: "range",
      noticePeriodMonths: "range",
      validFrom: "date",
      options: "range",
    });
    const options = validateProductDraft(
      draft({
        options: [
          { ...EMPTY_OPTION, optionId: "standard", label: "Standard", monthly: "12", work: "32" },
          { ...EMPTY_OPTION, optionId: "standard", label: "", monthly: "zwölf", work: "" },
        ],
      }),
      TODAY,
    );
    expect(options.errors).toEqual({
      "options.1.optionId": "duplicate",
      "options.1.label": "required",
      "options.1.monthly": "price",
      "options.1.work": "required",
    });
  });

  it("takes new prices for every option of a price version, from today on", () => {
    const strom = product();
    const rows = [
      { ...EMPTY_OPTION, monthly: "13,00", work: "33" },
      { ...EMPTY_OPTION, monthly: "13,00", work: "35,5" },
    ];
    const { value } = validatePriceDraft(strom, { validFrom: "2026-11-01", options: rows }, TODAY);
    expect(value).toEqual({
      validFrom: "2026-11-01",
      options: [
        { optionId: "standard", label: "Standard", monthlyPriceCent: 1300, workPriceCent: 33 },
        { optionId: "oeko", label: "Öko", monthlyPriceCent: 1300, workPriceCent: 35.5 },
      ],
    });
    expect(
      validatePriceDraft(
        strom,
        { validFrom: "2026-10-01", options: [rows[0] ?? EMPTY_OPTION] },
        TODAY,
      ).errors,
    ).toEqual({ validFrom: "date", "options.1.monthly": "required", "options.1.work": "required" });
  });
});

describe("product bodies from the browser", () => {
  it("accept a ProductInput and nothing more", () => {
    const input = validateProductDraft(draft(), TODAY).value;
    expect(parseProductInput(input)).toEqual(input);
    expect(parseProductInput({ ...input, status: "active" })).toBeUndefined();
    expect(parseProductInput({ ...input, productId: "Strom!" })).toBeUndefined();
    expect(parseProductInput({ ...input, options: [] })).toBeUndefined();
    expect(
      parseProductInput({
        ...input,
        options: [
          { optionId: "a", label: "A", monthlyPriceCent: 100 },
          { optionId: "a", label: "B", monthlyPriceCent: 200 },
        ],
      }),
    ).toBeUndefined();
  });

  it("accept updates of texts, terms or status only", () => {
    expect(parseProductUpdate({ status: "retiring" })).toEqual({ status: "retiring" });
    expect(parseProductUpdate({ name: "Strom Plus", minimumTermMonths: 24 })).toEqual({
      name: "Strom Plus",
      minimumTermMonths: 24,
    });
    expect(parseProductUpdate({})).toBeUndefined();
    expect(parseProductUpdate({ status: "deleted" })).toBeUndefined();
    expect(parseProductUpdate({ options: [] })).toBeUndefined();
    expect(parseProductUpdate({ noticePeriodMonths: 13 })).toBeUndefined();
  });

  it("accept price versions from today on", () => {
    const options = product().options;
    expect(parsePriceVersionInput({ validFrom: TODAY, options }, TODAY)).toEqual({
      validFrom: TODAY,
      options,
    });
    expect(parsePriceVersionInput({ validFrom: "2026-10-01", options }, TODAY)).toBeUndefined();
    expect(parsePriceVersionInput({ validFrom: TODAY, options, note: "x" }, TODAY)).toBeUndefined();
  });
});
