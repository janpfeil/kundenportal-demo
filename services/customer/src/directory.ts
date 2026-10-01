import {
  type ContractSnapshot,
  CustomerOrigin,
  Division,
  IsoDate,
  Locale,
  PostalAddress,
} from "@kundenportal/events";
import { badRequest } from "@kundenportal/service-kit";
import { z } from "zod";
import type { Customer } from "./customer.js";

/**
 * The operator's customer directory (phase 7): one partition per tenant with a short
 * profile per customer and one small item per contract, so the cockpit's list with
 * filters is a single Query instead of a scan (see `DirectoryRepository`).
 */

/** Profile summary of a customer in the directory; mirrors the profile, minus nothing. */
export const DirectoryProfile = z.object({
  customerId: z.string(),
  displayName: z.string(),
  email: z.email(),
  origin: CustomerOrigin,
  createdAt: z.iso.datetime({ offset: true }),
  locale: Locale.optional(),
  address: PostalAddress.optional(),
  phone: z.string().optional(),
  legacyAccounts: z
    .union([z.set(z.string()), z.array(z.string())])
    .transform((refs) => [...refs].sort())
    .optional(),
});
export type DirectoryProfile = z.infer<typeof DirectoryProfile>;

/** A contract of a customer in the directory, from the latest `ContractChanged` snapshot. */
export const DirectoryContract = z.object({
  customerId: z.string(),
  contractId: z.string(),
  division: Division,
  status: z.enum(["active", "terminated"]),
  startDate: IsoDate,
  version: z.number().int().positive(),
  termination: z
    .object({ kind: z.enum(["termination", "withdrawal"]), effectiveDate: IsoDate })
    .optional(),
  blocked: z.boolean().optional(),
  productId: z.string().optional(),
  productVersion: z.number().int().positive().optional(),
});
export type DirectoryContract = z.infer<typeof DirectoryContract>;

export type ContractState = "active" | "pending-termination" | "terminated";

/** Mirrors `CustomerSummary` in the OpenAPI contract. */
export interface CustomerSummary extends DirectoryProfile {
  divisions: Division[];
  contracts: { active: number; pendingTermination: number; terminated: number };
}

export interface CustomerPage {
  items: CustomerSummary[];
  total: number;
  nextCursor?: string;
}

export function profileSummary(customer: Customer): DirectoryProfile {
  return DirectoryProfile.parse(customer);
}

/** The snapshot's fields the directory keeps (zod drops the rest, also inside `termination`). */
export function contractSummary(snapshot: ContractSnapshot): DirectoryContract {
  return DirectoryContract.parse(snapshot);
}

/**
 * State of a contract on a German calendar day: terminated once the snapshot says so,
 * after a withdrawal, or when the day of a termination's end has passed; until then a
 * termination is pending (the contract still runs on its last day).
 */
export function contractState(contract: DirectoryContract, today: string): ContractState {
  const end = contract.termination;
  if (contract.status === "terminated" || end?.kind === "withdrawal") return "terminated";
  if (end) return end.effectiveDate < today ? "terminated" : "pending-termination";
  return "active";
}

export function summarize(
  profile: DirectoryProfile,
  contracts: readonly DirectoryContract[],
  today: string,
): CustomerSummary {
  const counts = { active: 0, pendingTermination: 0, terminated: 0 };
  const running = new Set<Division>();
  for (const contract of contracts) {
    const state = contractState(contract, today);
    if (state === "terminated") counts.terminated += 1;
    else {
      running.add(contract.division);
      if (state === "active") counts.active += 1;
      else counts.pendingTermination += 1;
    }
  }
  return {
    ...profile,
    divisions: Division.options.filter((division) => running.has(division)),
    contracts: counts,
  };
}

/** Empty query parameters count as missing (forms send `?origin=`). */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

/** Query parameters of `GET /admin/customers`. */
export const CustomerQuery = z.object({
  q: optional(z.string().trim().max(60)),
  origin: optional(CustomerOrigin),
  division: optional(Division),
  contracts: optional(z.enum(["active", "pending-termination", "terminated", "none"])),
  sort: optional(z.enum(["name", "createdAt"])).transform((sort) => sort ?? "createdAt"),
  order: optional(z.enum(["asc", "desc"])).transform((order) => order ?? "desc"),
  limit: optional(z.coerce.number().int().min(1).max(100)).transform((limit) => limit ?? 25),
  cursor: optional(z.string().max(400)),
});
export type CustomerQuery = z.infer<typeof CustomerQuery>;

export function parseCustomerQuery(params: Record<string, string | undefined> = {}): CustomerQuery {
  const parsed = CustomerQuery.safeParse(params);
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    );
  }
  return parsed.data;
}

/** Position after the last item of a page: the sort value and the customer id as tie-breaker. */
const Cursor = z.object({
  s: z.enum(["name", "createdAt"]),
  o: z.enum(["asc", "desc"]),
  v: z.string(),
  id: z.string(),
});
type Cursor = z.infer<typeof Cursor>;

const encodeCursor = (cursor: Cursor) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

function decodeCursor(text: string, query: CustomerQuery): Cursor {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
  } catch {
    throw badRequest("Invalid cursor");
  }
  const parsed = Cursor.safeParse(raw);
  if (!parsed.success || parsed.data.s !== query.sort || parsed.data.o !== query.order) {
    throw badRequest("Invalid cursor");
  }
  return parsed.data;
}

const names = new Intl.Collator("de", { sensitivity: "base", numeric: true });

const sortValue = (summary: CustomerSummary, sort: CustomerQuery["sort"]) =>
  sort === "name" ? summary.displayName : summary.createdAt;

function compare(
  a: { value: string; id: string },
  b: { value: string; id: string },
  sort: CustomerQuery["sort"],
): number {
  const byValue =
    sort === "name" ? names.compare(a.value, b.value) : Date.parse(a.value) - Date.parse(b.value);
  if (byValue !== 0) return byValue;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function matches(summary: CustomerSummary, query: CustomerQuery): boolean {
  if (query.origin && summary.origin !== query.origin) return false;
  if (query.division && !summary.divisions.includes(query.division)) return false;
  const { active, pendingTermination, terminated } = summary.contracts;
  switch (query.contracts) {
    case "active":
      if (active === 0) return false;
      break;
    case "pending-termination":
      if (pendingTermination === 0) return false;
      break;
    case "terminated":
      if (terminated === 0) return false;
      break;
    case "none":
      if (active + pendingTermination + terminated > 0) return false;
      break;
  }
  const q = query.q?.toLocaleLowerCase("de");
  if (!q) return true;
  return [
    summary.displayName,
    summary.email,
    summary.customerId,
    summary.address?.city,
    ...(summary.legacyAccounts ?? []),
  ].some((text) => text?.toLocaleLowerCase("de").includes(q));
}

/**
 * Filters, sorts and pages the directory in memory. The cursor holds the position after
 * the last item (keyset), so customers added in between neither repeat nor skip others.
 */
export function selectPage(
  summaries: readonly CustomerSummary[],
  query: CustomerQuery,
): CustomerPage {
  const direction = query.order === "asc" ? 1 : -1;
  const keyOf = (summary: CustomerSummary) => ({
    value: sortValue(summary, query.sort),
    id: summary.customerId,
  });
  const sorted = summaries
    .filter((summary) => matches(summary, query))
    .sort((a, b) => direction * compare(keyOf(a), keyOf(b), query.sort));
  const after = query.cursor ? decodeCursor(query.cursor, query) : undefined;
  const start = after
    ? sorted.findIndex(
        (summary) =>
          direction * compare(keyOf(summary), { value: after.v, id: after.id }, query.sort) > 0,
      )
    : 0;
  const items = start < 0 ? [] : sorted.slice(start, start + query.limit);
  const last = items.at(-1);
  const more = start >= 0 && start + query.limit < sorted.length;
  return {
    items,
    total: sorted.length,
    ...(more && last
      ? {
          nextCursor: encodeCursor({
            s: query.sort,
            o: query.order,
            v: sortValue(last, query.sort),
            id: last.customerId,
          }),
        }
      : {}),
  };
}
