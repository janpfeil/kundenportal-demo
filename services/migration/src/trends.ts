import type { LegacySystem } from "@kundenportal/events";
import {
  addCalendarDays,
  germanDate,
  germanDayStart,
  lastGermanDays,
} from "@kundenportal/service-kit";
import type { MigrationRecord } from "./model.js";

/** `MigrationTrends` of the contract: the last seven German days, oldest first. */
export interface MigrationTrends {
  days: string[];
  /** Open clarification cases at the end of each day. */
  clarifications: number[];
  /** Records in the dead-letter queue at the end of each day. */
  deadLetters: number[];
  /** Clarification cases raised in the last 24 hours. */
  newClarifications: number;
  /** Dead letters redriven in the last 24 hours that did not fail again. */
  redriven: number;
}

export const TREND_DAYS = 7;
const DAY_MS = 86_400_000;

const time = (value: string | undefined) => (value ? Date.parse(value) : Number.NaN);

/**
 * Records migrated or linked since 00:00 German time today (`systems[].migratedToday`).
 * `updatedAt` of such a record is the time it was migrated or linked: nothing writes a
 * migrated or linked record again except the migration itself.
 */
export function migratedToday(
  records: readonly MigrationRecord[],
  system: LegacySystem,
  now: Date,
): number {
  const since = germanDayStart(germanDate(now)).getTime();
  return records.filter(
    (record) =>
      record.account.system === system &&
      (record.status === "migrated" || record.status === "linked") &&
      time(record.updatedAt) >= since,
  ).length;
}

/**
 * When a record entered the dead-letter queue. Records that failed before `failedAt`
 * existed fall back to `updatedAt` (the failure was their last write).
 */
function failedAtOf(record: MigrationRecord): number {
  if (record.failedAt) return time(record.failedAt);
  return record.status === "failed" ? time(record.updatedAt) : Number.NaN;
}

/** Was the record in the dead-letter queue at `instant` (the first moment of the next day)? */
function deadLetterAt(record: MigrationRecord, instant: number): boolean {
  const failedAt = failedAtOf(record);
  if (!(failedAt < instant)) return false;
  if (record.status === "failed") return true;
  // Left the queue by a redrive after that day.
  return time(record.redrivenAt) >= instant;
}

/**
 * Course of the clarification cases and dead letters over the last seven German days,
 * derived from the records alone (no history items, no extra writes). A day ends at
 * 00:00 German time of the next day, so days around the change of the clocks last 23
 * or 25 hours. The records only keep their latest state, so the course is an
 * approximation: a clarification case counts from its last update on; a record that
 * failed, was redriven and failed again counts from its latest failure on.
 */
export function migrationTrends(records: readonly MigrationRecord[], now: Date): MigrationTrends {
  const days = lastGermanDays(now, TREND_DAYS);
  // "At the end of day i" = before the first moment of day i + 1.
  const ends = days.map((day) => germanDayStart(addCalendarDays(day, 1)).getTime());
  const clarifications = records.filter((record) => record.status === "clarification");
  const nowMs = now.getTime();
  const lastDay = (value: string | undefined) => {
    const at = time(value);
    return at > nowMs - DAY_MS && at <= nowMs;
  };
  return {
    days,
    clarifications: ends.map(
      (end) => clarifications.filter((record) => time(record.updatedAt) < end).length,
    ),
    deadLetters: ends.map((end) => records.filter((record) => deadLetterAt(record, end)).length),
    newClarifications: clarifications.filter((record) => lastDay(record.updatedAt)).length,
    redriven: records.filter((record) => record.status !== "failed" && lastDay(record.redrivenAt))
      .length,
  };
}
