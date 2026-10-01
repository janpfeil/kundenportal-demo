import { describe, expect, it } from "vitest";
import {
  contractState,
  type CustomerSummary,
  type DirectoryContract,
  type DirectoryProfile,
  parseCustomerQuery,
  selectPage,
  summarize,
} from "./directory.js";

const TODAY = "2026-10-02";

const contract = (overrides: Partial<DirectoryContract> = {}): DirectoryContract => ({
  customerId: "c-1",
  contractId: "k-1",
  division: "electricity",
  status: "active",
  startDate: "2026-01-01",
  version: 1,
  ...overrides,
});

const profile = (overrides: Partial<DirectoryProfile> = {}): DirectoryProfile => ({
  customerId: "c-1",
  displayName: "Anna Becker",
  email: "anna.becker@example.org",
  origin: "registration",
  createdAt: "2026-09-01T10:00:00.000Z",
  ...overrides,
});

describe("contractState", () => {
  it("counts a termination as pending up to and including its last day", () => {
    const ending = (effectiveDate: string) =>
      contract({
        termination: { kind: "termination", effectiveDate },
      });
    expect(contractState(ending("2026-12-31"), TODAY)).toBe("pending-termination");
    expect(contractState(ending(TODAY), TODAY)).toBe("pending-termination");
    expect(contractState(ending("2026-10-01"), TODAY)).toBe("terminated");
  });

  it("counts a withdrawal and a terminated snapshot as terminated at once", () => {
    expect(
      contractState(
        contract({ termination: { kind: "withdrawal", effectiveDate: "2026-10-30" } }),
        TODAY,
      ),
    ).toBe("terminated");
    expect(contractState(contract({ status: "terminated" }), TODAY)).toBe("terminated");
    expect(contractState(contract(), TODAY)).toBe("active");
  });
});

describe("summarize", () => {
  it("counts contracts by state and lists the divisions with a running contract", () => {
    const summary = summarize(
      profile(),
      [
        contract({ contractId: "k-1", division: "mobile" }),
        contract({
          contractId: "k-2",
          division: "electricity",
          termination: { kind: "termination", effectiveDate: "2026-12-31" },
        }),
        contract({ contractId: "k-3", division: "gas", status: "terminated" }),
      ],
      TODAY,
    );
    expect(summary.contracts).toEqual({ active: 1, pendingTermination: 1, terminated: 1 });
    expect(summary.divisions).toEqual(["electricity", "mobile"]);
  });
});

describe("parseCustomerQuery", () => {
  it("applies the defaults and treats empty parameters as missing", () => {
    expect(parseCustomerQuery({ origin: "", q: "" })).toEqual({
      sort: "createdAt",
      order: "desc",
      limit: 25,
    });
    expect(parseCustomerQuery({ limit: "100", sort: "name", order: "asc" })).toMatchObject({
      limit: 100,
      sort: "name",
      order: "asc",
    });
  });

  it.each([
    { limit: "0" },
    { limit: "101" },
    { limit: "abc" },
    { origin: "elsewhere" },
    { division: "heat" },
    { contracts: "some" },
    { sort: "email" },
    { q: "x".repeat(61) },
  ])("rejects %j with 400", (params) => {
    expect(() => parseCustomerQuery(params)).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe("selectPage", () => {
  const customers: CustomerSummary[] = [
    summarize(
      profile({
        customerId: "c-1",
        displayName: "Anna Becker",
        createdAt: "2026-09-01T10:00:00.000Z",
        origin: "legacy-utility",
        address: { street: "Lindenweg", houseNumber: "12", postalCode: "04109", city: "Leipzig" },
        legacyAccounts: ["utility:V-1000123"],
      }),
      [contract({ customerId: "c-1", division: "electricity" })],
      TODAY,
    ),
    summarize(
      profile({
        customerId: "c-2",
        displayName: "bernd Yilmaz",
        email: "bernd@example.net",
        createdAt: "2026-09-03T10:00:00.000Z",
        origin: "legacy-telco",
        legacyAccounts: ["telco:T/88-4711"],
      }),
      [
        contract({
          customerId: "c-2",
          contractId: "k-2",
          division: "internet",
          termination: { kind: "termination", effectiveDate: "2026-12-31" },
        }),
      ],
      TODAY,
    ),
    summarize(
      profile({
        customerId: "c-3",
        displayName: "Carla Schulz",
        email: "carla@example.com",
        createdAt: "2026-09-02T10:00:00.000Z",
      }),
      [contract({ customerId: "c-3", contractId: "k-3", status: "terminated" })],
      TODAY,
    ),
    summarize(
      profile({
        customerId: "c-4",
        displayName: "Ärzte Döring",
        email: "doering@example.com",
        createdAt: "2026-09-04T10:00:00.000Z",
      }),
      [],
      TODAY,
    ),
  ];
  const ids = (page: { items: CustomerSummary[] }) => page.items.map((c) => c.customerId);
  const select = (params: Record<string, string> = {}) =>
    selectPage(customers, parseCustomerQuery(params));

  it("leaves the E2E runs' throw-away accounts at the reserved .invalid domain out", () => {
    const test = summarize(
      profile({ customerId: "c-9", email: "e2e-1@kundenportal.invalid" }),
      [],
      TODAY,
    );
    const page = selectPage([...customers, test], parseCustomerQuery({}));
    expect(ids(page)).not.toContain("c-9");
    expect(page.total).toBe(customers.length);
  });

  it("sorts newest first by default and counts all matches", () => {
    const page = select();
    expect(ids(page)).toEqual(["c-4", "c-2", "c-3", "c-1"]);
    expect(page.total).toBe(4);
    expect(page.nextCursor).toBeUndefined();
  });

  it("sorts by name with German collation in both directions", () => {
    expect(ids(select({ sort: "name", order: "asc" }))).toEqual(["c-1", "c-4", "c-2", "c-3"]);
    expect(ids(select({ sort: "name", order: "desc" }))).toEqual(["c-3", "c-2", "c-4", "c-1"]);
  });

  it.each([
    [{ q: "leipzig" }, ["c-1"]],
    [{ q: "V-1000123" }, ["c-1"]],
    [{ q: "T/88" }, ["c-2"]],
    [{ q: "EXAMPLE.COM" }, ["c-4", "c-3"]],
    [{ q: "c-3" }, ["c-3"]],
    [{ q: "yilmaz" }, ["c-2"]],
    [{ origin: "registration" }, ["c-4", "c-3"]],
    [{ division: "internet" }, ["c-2"]],
    [{ division: "electricity" }, ["c-1"]],
    [{ contracts: "active" }, ["c-1"]],
    [{ contracts: "pending-termination" }, ["c-2"]],
    [{ contracts: "terminated" }, ["c-3"]],
    [{ contracts: "none" }, ["c-4"]],
    [{ origin: "registration", contracts: "none" }, ["c-4"]],
  ])("filters by %j", (params, expected) => {
    const page = select(params);
    expect(ids(page)).toEqual(expected);
    expect(page.total).toBe(expected.length);
  });

  it("pages with an opaque cursor that continues after the last item", () => {
    const first = select({ limit: "2", sort: "name", order: "asc" });
    expect(ids(first)).toEqual(["c-1", "c-4"]);
    expect(first.total).toBe(4);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = select({
      limit: "2",
      sort: "name",
      order: "asc",
      cursor: first.nextCursor ?? "",
    });
    expect(ids(second)).toEqual(["c-2", "c-3"]);
    expect(second.total).toBe(4);
    expect(second.nextCursor).toBeUndefined();
  });

  it("neither repeats nor skips when a customer arrives between two pages", () => {
    const first = selectPage(customers, parseCustomerQuery({ limit: "2" }));
    const newcomer = summarize(
      profile({ customerId: "c-5", createdAt: "2026-10-01T10:00:00.000Z" }),
      [],
      TODAY,
    );
    const second = selectPage(
      [...customers, newcomer],
      parseCustomerQuery({ limit: "2", cursor: first.nextCursor ?? "" }),
    );
    expect([...ids(first), ...ids(second)]).toEqual(["c-4", "c-2", "c-3", "c-1"]);
    expect(second.total).toBe(5);
  });

  it("rejects a forged cursor or one of another sort order with 400", () => {
    const first = select({ limit: "1" });
    expect(() => select({ cursor: "not-a-cursor" })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => select({ cursor: first.nextCursor ?? "", sort: "name" })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });
});
