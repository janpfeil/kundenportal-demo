/*
 * The cockpit search ("Konto, Mandant, Ereignis …"): reads the query, matches the owner's
 * pass tenants and groups the hits of GET /migration/search for the result page.
 */

import type { components } from "@kundenportal/api-contract";
import type { PassSummary } from "./tenancy";

export type SearchResult = components["schemas"]["MigrationSearchResult"];

/** Bounds of the API (`q`: 2–60 characters). */
export const MIN_QUERY = 2;
export const MAX_QUERY = 60;
/** At most this many hits per group, like the API's accounts and events. */
export const MAX_HITS = 10;

export type Query =
  { kind: "empty" } | { kind: "short"; query: string } | { kind: "ok"; query: string };

/** The query of the search page from `?q=`: trimmed, cut to 60 characters. */
export function readQuery(raw: string | string[] | undefined): Query {
  const value = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const query = value.trim().slice(0, MAX_QUERY);
  if (query === "") return { kind: "empty" };
  if (query.length < MIN_QUERY) return { kind: "short", query };
  return { kind: "ok", query };
}

/** Passes whose tenant, e-mail address or pass id contain the query (any case), newest first. */
export function matchPasses(passes: readonly PassSummary[], query: string): PassSummary[] {
  const needle = query.toLowerCase();
  return passes
    .filter((pass) =>
      [pass.tenantId, pass.email, pass.passId].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    )
    .sort((a, b) => (b.createdAt ?? b.validUntil).localeCompare(a.createdAt ?? a.validUntil))
    .slice(0, MAX_HITS);
}

export interface SearchGroups {
  accounts: SearchResult["accounts"];
  /** Pass tenants; only for the owner (undefined for pass holders). */
  tenants: PassSummary[] | undefined;
  events: SearchResult["events"];
  /** Number of hits over all groups. */
  total: number;
}

/**
 * The result page's groups: accounts and events from the migration search, tenants from the
 * owner's passes. A failed part counts as no hits; the page says when the search failed.
 */
export function groupResults(
  result: SearchResult | undefined,
  passes: readonly PassSummary[] | undefined,
  query: string,
  owner: boolean,
): SearchGroups {
  const accounts = result?.accounts ?? [];
  const events = result?.events ?? [];
  const tenants = owner ? matchPasses(passes ?? [], query) : undefined;
  return {
    accounts,
    tenants,
    events,
    total: accounts.length + events.length + (tenants?.length ?? 0),
  };
}
