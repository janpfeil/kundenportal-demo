import { Division, IsoDate } from "@kundenportal/events";
import { badRequest, germanDate, lastGermanDays } from "@kundenportal/service-kit";
import { z } from "zod";
import {
  type ContractRecord,
  type ContractStatus,
  minimumTermEndOf,
  productIdOf,
  productVersionOf,
  Termination,
} from "./contract.js";
import { addDays } from "./dates.js";

/**
 * The tenant's contract directory: one small item per contract in one partition
 * (`TENANT#<t>#CONTRACTS`), written with every save of the contract. The operator's list,
 * the overview and the contract counts per product read the partition with one Query
 * and filter, sort and page in memory — no scan, no index.
 */
export const DirectoryEntry = z.object({
  contractId: z.uuid(),
  customerId: z.string().min(1),
  customerName: z.string().optional(),
  division: Division,
  productId: z.string(),
  productVersion: z.number().int().positive(),
  tariffName: z.string(),
  tariffOption: z.string(),
  monthlyInstallmentCent: z.number().int().nonnegative(),
  meterNumber: z.string().optional(),
  startDate: IsoDate,
  minimumTermEndDate: IsoDate,
  /** As stored on the contract; the effective status is computed on read. */
  status: z.enum(["active", "terminated"]),
  termination: Termination.optional(),
  blocked: z.boolean().optional(),
  orderedAt: z.iso.datetime({ offset: true }).optional(),
  updatedAt: z.iso.datetime({ offset: true }),
  testAccount: z.boolean().optional(),
});
export type DirectoryEntry = z.infer<typeof DirectoryEntry>;

export function toEntry(record: ContractRecord): DirectoryEntry {
  const entry: DirectoryEntry = {
    contractId: record.contractId,
    customerId: record.customerId,
    division: record.division,
    productId: productIdOf(record),
    productVersion: productVersionOf(record),
    tariffName: record.tariffName,
    tariffOption: record.tariffOption,
    monthlyInstallmentCent: record.monthlyInstallmentCent,
    startDate: record.startDate,
    minimumTermEndDate: minimumTermEndOf(record),
    status: record.status,
    updatedAt: record.updatedAt,
  };
  if (record.customerName) entry.customerName = record.customerName;
  if (record.testAccount) entry.testAccount = true;
  if (record.meterNumber) entry.meterNumber = record.meterNumber;
  if (record.termination) entry.termination = record.termination;
  if (record.blocked) entry.blocked = true;
  if (record.orderedAt) entry.orderedAt = record.orderedAt;
  return entry;
}

/** Same rule as `statusOf` for contracts. */
export function entryStatus(entry: DirectoryEntry, today: string): ContractStatus {
  if (entry.status === "terminated") return "terminated";
  if (entry.termination && entry.termination.effectiveDate < today) return "terminated";
  return "active";
}

const isPending = (entry: DirectoryEntry, today: string) =>
  entryStatus(entry, today) === "active" && entry.termination !== undefined;

/** The end the list sorts and filters by: a termination's date, else the minimum term's. */
const endDateOf = (entry: DirectoryEntry) =>
  entry.termination?.effectiveDate ?? entry.minimumTermEndDate;

/** A `ContractSummary` as the API returns it. */
export function summaryOf(entry: DirectoryEntry, today: string) {
  const { orderedAt: _orderedAt, ...summary } = entry;
  return { ...summary, status: entryStatus(entry, today) };
}

/** Query parameters of `GET /admin/contracts`. */
export const ContractQuery = z.object({
  q: z.string().trim().max(60).optional(),
  division: Division.optional(),
  status: z.enum(["active", "pending-termination", "terminated", "blocked"]).optional(),
  productId: z.string().min(1).max(40).optional(),
  customerId: z.string().min(1).max(80).optional(),
  endsBefore: IsoDate.optional(),
  sort: z.enum(["startDate", "endDate", "updatedAt"]).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(400).optional(),
});
export type ContractQuery = z.infer<typeof ContractQuery>;

function matches(entry: DirectoryEntry, query: ContractQuery, today: string): boolean {
  if (query.division && entry.division !== query.division) return false;
  if (query.productId && entry.productId !== query.productId) return false;
  if (query.customerId && entry.customerId !== query.customerId) return false;
  if (query.endsBefore && endDateOf(entry) > query.endsBefore) return false;
  switch (query.status) {
    case "active":
      if (entryStatus(entry, today) !== "active" || isPending(entry, today)) return false;
      break;
    case "pending-termination":
      if (!isPending(entry, today)) return false;
      break;
    case "terminated":
      if (entryStatus(entry, today) !== "terminated") return false;
      break;
    case "blocked":
      if (!entry.blocked) return false;
      break;
  }
  if (query.q) {
    const needle = query.q.toLowerCase();
    const haystack = [entry.contractId, entry.meterNumber, entry.tariffName, entry.productId];
    if (!haystack.some((value) => value?.toLowerCase().includes(needle))) return false;
  }
  return true;
}

const sortKey = (entry: DirectoryEntry, sort: ContractQuery["sort"]) =>
  sort === "endDate" ? endDateOf(entry) : entry[sort];

const Cursor = z.object({
  s: z.enum(["startDate", "endDate", "updatedAt"]),
  o: z.enum(["asc", "desc"]),
  k: z.string(),
  id: z.string(),
});

function decodeCursor(cursor: string, query: ContractQuery): z.infer<typeof Cursor> {
  try {
    const parsed = Cursor.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (parsed.s === query.sort && parsed.o === query.order) return parsed;
  } catch {
    // fall through
  }
  throw badRequest("Invalid cursor");
}

/**
 * One page of the directory: filtered, sorted by the chosen date (ties by contract id,
 * so the order is total) and continued after the cursor's position. The cursor names the
 * last item's sort key and id, so a page does not shift when contracts change elsewhere.
 */
export function contractPage(entries: DirectoryEntry[], query: ContractQuery, now: Date) {
  const today = germanDate(now);
  const direction = query.order === "asc" ? 1 : -1;
  const compare = (a: { k: string; id: string }, b: { k: string; id: string }) =>
    direction * (a.k < b.k ? -1 : a.k > b.k ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const sorted = entries
    .filter((entry) => !entry.testAccount && matches(entry, query, today))
    .map((entry) => ({ entry, k: sortKey(entry, query.sort), id: entry.contractId }))
    .sort(compare);
  let start = 0;
  if (query.cursor) {
    const after = decodeCursor(query.cursor, query);
    const index = sorted.findIndex((item) => compare(item, after) > 0);
    start = index < 0 ? sorted.length : index;
  }
  const page = sorted.slice(start, start + query.limit);
  const last = page[page.length - 1];
  const nextCursor =
    last && start + query.limit < sorted.length
      ? Buffer.from(
          JSON.stringify({ s: query.sort, o: query.order, k: last.k, id: last.id }),
        ).toString("base64url")
      : undefined;
  return {
    items: page.map((item) => summaryOf(item.entry, today)),
    total: sorted.length,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

/** Days ahead in which a pending termination counts as "ending soon". */
export const ENDING_SOON_DAYS = 30;

/** Key figures of the operator's cockpit (`OperatorOverview`). */
export function overview(entries: DirectoryEntry[], now: Date) {
  const today = germanDate(now);
  const days = lastGermanDays(now, 7);
  const perDay = (dates: (string | undefined)[]) => {
    const german = dates.flatMap((at) => (at ? [germanDate(new Date(at))] : []));
    return days.map((day) => german.filter((date) => date === day).length);
  };
  const contracts = { active: 0, pendingTermination: 0, terminated: 0, blocked: 0 };
  const byDivision = Object.fromEntries(Division.options.map((d) => [d, 0])) as Record<
    Division,
    number
  >;
  const soon = addDays(today, ENDING_SOON_DAYS);
  let endingSoon = 0;
  for (const entry of entries.filter((item) => !item.testAccount)) {
    if (entry.blocked) contracts.blocked += 1;
    if (entryStatus(entry, today) === "terminated") {
      contracts.terminated += 1;
      continue;
    }
    byDivision[entry.division] += 1;
    if (entry.termination) {
      contracts.pendingTermination += 1;
      if (entry.termination.effectiveDate <= soon) endingSoon += 1;
    } else {
      contracts.active += 1;
    }
  }
  return {
    contracts,
    byDivision,
    days,
    orders: perDay(entries.map((e) => e.orderedAt)),
    terminations: perDay(entries.map((e) => e.termination?.requestedAt)),
    endingSoon,
  };
}

/** Running contracts of a product per price version (operator's product views). */
export function runningByVersion(
  entries: DirectoryEntry[],
  productId: string,
  now: Date,
): Record<number, number> {
  const today = germanDate(now);
  const counts: Record<number, number> = {};
  for (const entry of entries) {
    if (entry.productId !== productId || entryStatus(entry, today) !== "active") continue;
    counts[entry.productVersion] = (counts[entry.productVersion] ?? 0) + 1;
  }
  return counts;
}
