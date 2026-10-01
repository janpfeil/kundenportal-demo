import { describe, expect, it } from "vitest";
import {
  ContractQuery,
  contractPage,
  type DirectoryEntry,
  overview,
  runningByVersion,
} from "./directory.js";

// 2 October 2026, 00:30 German time (still 1 October in UTC).
const now = new Date("2026-10-01T22:30:00.000Z");

let n = 0;
function entry(fields: Partial<DirectoryEntry> = {}): DirectoryEntry {
  n += 1;
  return {
    contractId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    customerId: "c-1",
    division: "electricity",
    productId: "strom-klassik",
    productVersion: 1,
    tariffName: "Strom Klassik",
    tariffOption: "standard",
    monthlyInstallmentCent: 8700,
    startDate: "2026-04-03",
    minimumTermEndDate: "2027-04-03",
    status: "active",
    updatedAt: `2026-09-${String(n).padStart(2, "0")}T10:00:00.000Z`,
    ...fields,
  };
}
const termination = (effectiveDate: string, requestedAt = "2026-09-20T10:00:00.000Z") => ({
  kind: "termination" as const,
  effectiveDate,
  requestedAt,
  by: "customer" as const,
});

const running = entry({ meterNumber: "1EMH0012345678" });
const pending = entry({
  division: "gas",
  productId: "gas-komfort",
  termination: termination("2026-10-31"),
});
const ended = entry({
  division: "mobile",
  productId: "mobil-flex",
  termination: termination("2026-10-01"),
});
const withdrawn = entry({
  status: "terminated",
  termination: { ...termination("2026-09-30"), kind: "withdrawal" },
  orderedAt: "2026-09-25T09:00:00.000Z",
});
const blocked = entry({
  customerId: "c-2",
  blocked: true,
  productVersion: 2,
  startDate: "2025-01-01",
});
const legacyEnded = entry({ status: "terminated", tariffName: "Wasser Basis", division: "water" });
const all = [running, pending, ended, withdrawn, blocked, legacyEnded];

const page = (query: Record<string, string> = {}, entries = all) =>
  contractPage(entries, ContractQuery.parse(query), now);
const ids = (result: { items: { contractId: string }[] }) => result.items.map((i) => i.contractId);

describe("contract directory", () => {
  it("computes the status on read: a termination takes effect after its last day", () => {
    const result = page({ sort: "updatedAt", order: "asc" });
    expect(result.items.map((i) => i.status)).toEqual([
      "active",
      "active",
      "terminated",
      "terminated",
      "active",
      "terminated",
    ]);
    expect(result.items[0]).not.toHaveProperty("orderedAt");
    expect(result.total).toBe(6);
  });

  it.each([
    ["active", [running, blocked]],
    ["pending-termination", [pending]],
    ["terminated", [ended, withdrawn, legacyEnded]],
    ["blocked", [blocked]],
  ])("filters by status %s", (status, expected) => {
    expect(ids(page({ status, order: "asc" }))).toEqual(expected.map((e) => e.contractId));
  });

  it("filters by division, product, customer and search text", () => {
    expect(ids(page({ division: "gas" }))).toEqual([pending.contractId]);
    expect(ids(page({ productId: "mobil-flex" }))).toEqual([ended.contractId]);
    expect(ids(page({ customerId: "c-2" }))).toEqual([blocked.contractId]);
    expect(ids(page({ q: "1emh0012" }))).toEqual([running.contractId]);
    expect(ids(page({ q: "wasser" }))).toEqual([legacyEnded.contractId]);
    expect(ids(page({ q: pending.contractId.slice(-6) }))).toEqual([pending.contractId]);
    expect(page({ q: "nothing" })).toEqual({ items: [], total: 0 });
  });

  it("leaves the E2E runs' throw-away accounts out of the list and the figures", () => {
    const test = entry({
      testAccount: true,
      orderedAt: now.toISOString(),
      termination: termination("2026-12-31", now.toISOString()),
    });
    expect(ids(page({}, [test, running]))).toEqual([running.contractId]);
    const figures = overview([test], now);
    expect(figures.contracts).toEqual({
      active: 0,
      pendingTermination: 0,
      terminated: 0,
      blocked: 0,
    });
    expect(figures.orders.at(-1)).toBe(0);
    expect(figures.terminations.at(-1)).toBe(0);
  });

  it("filters contracts ending by a date (termination, else minimum term)", () => {
    expect(ids(page({ endsBefore: "2026-10-31", order: "asc" }))).toEqual([
      pending.contractId,
      ended.contractId,
      withdrawn.contractId,
    ]);
  });

  it("sorts by start, end or last change, ties by contract id", () => {
    expect(ids(page({ sort: "startDate", order: "asc" }))[0]).toBe(blocked.contractId);
    expect(ids(page({ sort: "endDate", order: "asc" })).slice(0, 2)).toEqual([
      withdrawn.contractId,
      ended.contractId,
    ]);
    expect(ids(page({ sort: "updatedAt" }))[0]).toBe(legacyEnded.contractId);
  });

  it("pages with an opaque cursor that continues after the last item", () => {
    const first = page({ limit: "4", sort: "updatedAt", order: "asc" });
    expect(ids(first)).toEqual(all.slice(0, 4).map((e) => e.contractId));
    expect(first.total).toBe(6);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = page({
      limit: "4",
      sort: "updatedAt",
      order: "asc",
      cursor: first.nextCursor ?? "",
    });
    expect(ids(second)).toEqual(all.slice(4).map((e) => e.contractId));
    expect(second).not.toHaveProperty("nextCursor");
  });

  it("keeps its place when a contract on an earlier page disappears", () => {
    const first = page({ limit: "2", order: "asc" });
    const rest = all.filter((e) => e !== running);
    const second = page({ limit: "2", order: "asc", cursor: first.nextCursor ?? "" }, rest);
    expect(ids(second)).toEqual([ended.contractId, withdrawn.contractId]);
  });

  it("rejects a cursor of another sort order or a forged one with 400", () => {
    const first = page({ limit: "2" });
    expect(() => page({ limit: "2", order: "asc", cursor: first.nextCursor ?? "" })).toThrow(
      "Invalid cursor",
    );
    expect(() => page({ cursor: "not-a-cursor" })).toThrow("Invalid cursor");
  });

  it("validates the query", () => {
    expect(ContractQuery.safeParse({ limit: "0" }).success).toBe(false);
    expect(ContractQuery.safeParse({ limit: "101" }).success).toBe(false);
    expect(ContractQuery.safeParse({ status: "open" }).success).toBe(false);
    expect(ContractQuery.parse({})).toMatchObject({ sort: "updatedAt", order: "desc", limit: 25 });
  });
});

describe("overview", () => {
  it("counts by status, running contracts per division and contracts ending soon", () => {
    const later = entry({ termination: termination("2026-12-31") });
    const result = overview([...all, later], now);
    expect(result.contracts).toEqual({
      active: 2,
      pendingTermination: 2,
      terminated: 3,
      blocked: 1,
    });
    expect(result.byDivision).toEqual({ electricity: 3, gas: 1, water: 0, internet: 0, mobile: 0 });
    expect(result.endingSoon).toBe(1);
  });

  it("has seven German days, oldest first, with orders and terminations per day", () => {
    const entries = [
      entry({ orderedAt: "2026-09-25T22:30:00.000Z" }), // 26 September in Germany
      entry({ orderedAt: "2026-10-01T22:00:00.000Z" }), // 2 October, 00:00 in Germany
      entry({ orderedAt: "2026-09-20T10:00:00.000Z" }), // older than seven days
      entry({ termination: termination("2026-12-31", "2026-10-01T21:59:00.000Z") }), // 1 October
      entry({
        status: "terminated",
        termination: {
          ...termination("2026-10-02", "2026-10-01T22:10:00.000Z"),
          kind: "withdrawal",
        },
      }),
    ];
    const result = overview(entries, now);
    expect(result.days).toEqual([
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(result.orders).toEqual([1, 0, 0, 0, 0, 0, 1]);
    expect(result.terminations).toEqual([0, 0, 0, 0, 0, 1, 1]);
  });

  it("counts running contracts per price version of a product", () => {
    expect(runningByVersion(all, "strom-klassik", now)).toEqual({ 1: 1, 2: 1 });
  });
});
