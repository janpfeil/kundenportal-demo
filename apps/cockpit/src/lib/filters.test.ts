import { describe, expect, it } from "vitest";
import {
  activeFilters,
  contractFilters,
  contractQuery,
  customerFilters,
  customerQuery,
  isContractId,
  isCustomerId,
  isDate,
  listHref,
  productFilters,
} from "./filters";
import { centInput, euroInput, formatWorkPrice, parseCent, parseEuro, shortId } from "./money";
import { addDays } from "./time";

describe("customer filters", () => {
  it("read the URL and drop what is unknown or malformed", () => {
    expect(
      customerFilters({
        q: "  Helga   Kraus ",
        origin: "legacy-telco",
        division: ["gas", "water"],
        contracts: "maybe",
        sort: "name-desc",
        cursor: "eyJrIjoxfQ==",
      }),
    ).toEqual({
      q: "Helga Kraus",
      origin: "legacy-telco",
      division: "gas",
      contracts: undefined,
      sort: "name-desc",
      cursor: "eyJrIjoxfQ==",
    });
    const fallback = customerFilters({ sort: "shoe", cursor: "<script>", q: "x".repeat(80) });
    expect(fallback.sort).toBe("newest");
    expect(fallback.cursor).toBeUndefined();
    expect(fallback.q).toHaveLength(60);
  });

  it("map to the API's query, with the order split into sort and order", () => {
    expect(customerQuery(customerFilters({}))).toEqual({
      sort: "createdAt",
      order: "desc",
      limit: 25,
    });
    expect(
      customerQuery(
        customerFilters({ q: "Leipzig", division: "mobile", contracts: "none", sort: "name" }),
        10,
      ),
    ).toEqual({
      q: "Leipzig",
      division: "mobile",
      contracts: "none",
      sort: "name",
      order: "asc",
      limit: 10,
    });
    expect(customerQuery(customerFilters({ sort: "oldest", cursor: "abc" }))).toMatchObject({
      sort: "createdAt",
      order: "asc",
      cursor: "abc",
    });
  });
});

describe("contract filters", () => {
  it("accept a real date and a well-formed product only", () => {
    const filters = contractFilters({
      status: "pending-termination",
      product: "strom-klassik",
      endsBefore: "2026-11-01",
      sort: "end",
    });
    expect(contractQuery(filters)).toEqual({
      status: "pending-termination",
      productId: "strom-klassik",
      endsBefore: "2026-11-01",
      sort: "endDate",
      order: "asc",
      limit: 25,
    });
    const bad = contractFilters({
      product: "Strom Klassik",
      endsBefore: "2026-02-30",
      status: "x",
    });
    expect(bad).toMatchObject({ product: undefined, endsBefore: undefined, status: undefined });
    expect(contractQuery(bad)).toEqual({ sort: "updatedAt", order: "desc", limit: 25 });
  });

  it("filter products by division and status", () => {
    expect(productFilters({ division: "water", status: "retiring" })).toEqual({
      division: "water",
      status: "retiring",
    });
    expect(productFilters({ status: "sold-out" })).toEqual({
      division: undefined,
      status: undefined,
    });
  });
});

describe("list links", () => {
  it("keep the filters, leave out empty values and the default order", () => {
    const filters = customerFilters({ q: "Kraus", origin: "registration", sort: "newest" });
    expect(activeFilters(filters)).toBe(2);
    expect(listHref("/cockpit/kunden", filters)).toBe(
      "/cockpit/kunden?q=Kraus&origin=registration",
    );
    expect(listHref("/cockpit/kunden", filters, "next+page")).toBe(
      "/cockpit/kunden?q=Kraus&origin=registration&cursor=next%2Bpage",
    );
    expect(listHref("/cockpit/kunden", customerFilters({}))).toBe("/cockpit/kunden");
    const contracts = contractFilters({ sort: "end", cursor: "c1" });
    expect(listHref("/cockpit/vertraege", contracts, undefined, { sort: "updated" })).toBe(
      "/cockpit/vertraege?sort=end",
    );
    expect(activeFilters(contracts)).toBe(0);
  });
});

describe("ids, dates and money", () => {
  it("check ids before they go into an API path", () => {
    expect(isCustomerId("K-100042")).toBe(true);
    expect(isCustomerId("../admin")).toBe(false);
    expect(isContractId("0a1b2c3d-1111-2222-3333-444455556666")).toBe(true);
    expect(isContractId("drop table")).toBe(false);
    expect(isDate("2026-12-31")).toBe(true);
    expect(isDate("2026-13-01")).toBe(false);
    expect(addDays("2026-10-02", 30)).toBe("2026-11-01");
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
  });

  it("parse euros and cents as typed and format them back", () => {
    expect(parseEuro("87")).toBe(8700);
    expect(parseEuro("87,5")).toBe(8750);
    expect(parseEuro(" 12.99 € ")).toBe(1299);
    expect(parseEuro("1.200,00")).toBeUndefined();
    expect(parseEuro("-3")).toBeUndefined();
    expect(parseCent("32,4")).toBe(32.4);
    expect(parseCent("113")).toBe(113);
    expect(parseCent("abc")).toBeUndefined();
    expect(euroInput(1200, "de")).toBe("12,00");
    expect(euroInput(1299, "en")).toBe("12.99");
    expect(centInput(32.4, "de")).toBe("32,4");
    expect(formatWorkPrice(32.4, "kWh", "de")).toBe("32,4 ct/kWh");
    expect(formatWorkPrice(250, "m3", "de")).toBe("250 ct/m³");
    expect(shortId("0a1b2c3d-1111-2222-3333-444455556666")).toBe("0A1B2C3D");
  });
});
