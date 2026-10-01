import { addCalendarDays, germanDate } from "@kundenportal/service-kit";

/**
 * Calendar arithmetic on `YYYY-MM-DD` dates. Dates carry no time, so the arithmetic runs
 * on UTC midnights and never meets a change of the clocks; "today" is always the German
 * calendar date of the instant (`germanDate`), so a request at 00:30 German time on
 * 1 April already counts as 1 April although it is still 31 March in UTC.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: string): [number, number, number] {
  const match = DATE.exec(date);
  if (!match) throw new Error(`Not a date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

const iso = (year: number, monthIndex: number, day: number) =>
  new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);

/** Today as the German calendar date. */
export function today(now: Date): string {
  return germanDate(now);
}

export function addDays(date: string, days: number): string {
  return addCalendarDays(date, days);
}

/** Last day of the month `date` lies in. */
export function endOfMonth(date: string): string {
  const [year, month] = parts(date);
  return iso(year, month, 0);
}

/**
 * The same day `months` later; a day the target month does not have becomes its last
 * day (31 January + 1 month = 28/29 February, never 3 March).
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = parts(date);
  const lastDay = Number(endOfMonth(iso(year, month - 1 + months, 1)).slice(8));
  return iso(year, month - 1 + months, Math.min(day, lastDay));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two ISO dates (`to` minus `from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** `31.12.2026` — dates in German texts (history, problem details). */
export function germanFormat(date: string): string {
  const [year, month, day] = parts(date);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

/**
 * Earliest end a notice given on `on` reaches (fachkonzept, phase 7): the end of the
 * minimum term if the notice period still fits before it; afterwards the last day of the
 * month in which the notice period ends.
 */
export function earliestTerminationDate(
  on: string,
  minimumTermEndDate: string,
  noticePeriodMonths: number,
): string {
  const noticeEnds = addMonths(on, noticePeriodMonths);
  return noticeEnds <= minimumTermEndDate ? minimumTermEndDate : endOfMonth(noticeEnds);
}
