import { badRequest } from "@kundenportal/service-kit";
import { z } from "zod";
import { type MigrationRecord, refString, type TimelineEntry } from "./model.js";

/** At most this many hits per kind (`MigrationSearchResult` in the contract). */
export const SEARCH_LIMIT = 10;
/** Timeline entries the search reads (newest first; the cockpit itself shows 50). */
export const SEARCH_TIMELINE_ENTRIES = 200;

const SearchQuery = z.string().trim().min(2).max(60);

/** The `q` parameter of `GET /migration/search`, trimmed; 2 to 60 characters, else 400. */
export function searchQuery(raw: string | undefined): string {
  const parsed = SearchQuery.safeParse(raw ?? "");
  if (!parsed.success) throw badRequest("q must be 2 to 60 characters");
  return parsed.data;
}

const contains = (needle: string, ...values: (string | undefined)[]) =>
  values.some((value) => value?.toLocaleLowerCase("de-DE").includes(needle));

const newestFirst = <T>(items: T[], at: (item: T) => string) =>
  [...items].sort((a, b) => Date.parse(at(b)) - Date.parse(at(a)));

/**
 * Records whose customer number, name, status, problem or `system:customerNumber`
 * contain the query (any case); newest first, at most ten.
 */
export function matchRecords(records: readonly MigrationRecord[], query: string) {
  const needle = query.toLocaleLowerCase("de-DE");
  const hits = records.filter((record) =>
    contains(
      needle,
      record.account.customerNumber,
      refString(record.account),
      record.displayName,
      record.status,
      record.problem?.code,
      record.problem?.message,
    ),
  );
  return newestFirst(hits, (record) => record.updatedAt).slice(0, SEARCH_LIMIT);
}

/** Timeline entries whose type, summary or event id contain the query; newest first. */
export function matchTimeline(entries: readonly TimelineEntry[], query: string) {
  const needle = query.toLocaleLowerCase("de-DE");
  const hits = entries.filter((entry) =>
    contains(needle, entry.detailType, entry.summary, entry.eventId),
  );
  return newestFirst(hits, (entry) => entry.occurredAt).slice(0, SEARCH_LIMIT);
}
