/**
 * Calendar days as people in Germany see them (Europe/Berlin). Day counters and day
 * boundaries of the cockpits follow the German day, not UTC: "today" starts at 00:00
 * German time, which is 22:00 or 23:00 UTC the day before. Days around the change to and
 * from summer time last 23 or 25 hours; the boundaries come from the time zone database
 * (`Intl`), never from a fixed offset.
 */
export const GERMAN_TIME_ZONE = "Europe/Berlin";

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: GERMAN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  numberingSystem: "latn",
});

function berlinParts(at: Date) {
  const parts: Record<string, number> = {};
  for (const part of partsFormat.formatToParts(at)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** The German calendar date of an instant, `YYYY-MM-DD`. */
export function germanDate(at: Date): string {
  const { year, month, day } = berlinParts(at);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Offset of German time against UTC at an instant, in milliseconds (+1 h or +2 h). */
function berlinOffsetMs(at: number): number {
  const whole = Math.floor(at / 1000) * 1000;
  const p = berlinParts(new Date(whole));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateParts(date: string): [number, number, number] {
  const match = DATE.exec(date);
  if (!match) throw new Error(`Not a date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** The calendar date `days` after (or before, if negative) `date`; both `YYYY-MM-DD`. */
export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * The instant at which a German calendar day begins (00:00 German time). Midnight is
 * never inside a change of the clocks in Germany (they change at 02:00/03:00), so the
 * offset at that midnight is well defined; a second step corrects the first guess on
 * the days the offset changes.
 */
export function germanDayStart(date: string): Date {
  const [year, month, day] = dateParts(date);
  const midnightUtc = Date.UTC(year, month - 1, day);
  const guess = midnightUtc - berlinOffsetMs(midnightUtc);
  return new Date(midnightUtc - berlinOffsetMs(guess));
}

/** The last `count` German calendar dates up to the one of `at`; oldest first, today last. */
export function lastGermanDays(at: Date, count = 7): string[] {
  const today = germanDate(at);
  return Array.from({ length: count }, (_, index) => addCalendarDays(today, index - count + 1));
}

/**
 * Attribute of a per-day counter, `d<YYYYMMDD>` of the German date (e.g. `d20261001`):
 * the API quota guard counts each call there too, the pass overview sums the last days.
 */
export function dayAttribute(date: string): string {
  dateParts(date);
  return `d${date.replaceAll("-", "")}`;
}
