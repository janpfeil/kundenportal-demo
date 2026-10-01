/*
 * Calendar days as the API speaks them (`YYYY-MM-DD`, German time). Pure functions, so the
 * date rules of ordering, terminating and withdrawing are unit-tested without a clock.
 */

/** Dates on the portal are German time, wherever the server or the browser runs. */
export const TIME_ZONE = "Europe/Berlin";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The calendar day of `now` in German time as `YYYY-MM-DD`. */
export function dayKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Whether `value` is a real calendar day written as `YYYY-MM-DD` (no 31 February). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
  );
}

/** The day `days` after `key` (negative: before), independent of time zones and DST. */
export function addDays(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}
