/*
 * Times as the cockpit shows them, always in German time (Europe/Berlin) like the rest of
 * the portal: the live clock in the page head, short stamps in tables and the timeline, and
 * relative times ("vor 4 Min.") for the last activity of a pass.
 */

import type { Locale } from "@kundenportal/ui/i18n";
import { fill } from "@kundenportal/ui/i18n";

const ZONE = "Europe/Berlin";

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface Parts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

/** Calendar and clock parts of a point in time in German time, all zero-padded. */
export function berlinParts(date: Date): Parts {
  const parts = PARTS.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

const parse = (iso: string): Date | undefined => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** The German calendar day of a point in time, e.g. "2026-10-01". */
export function dayKey(date: Date): string {
  const { year, month, day } = berlinParts(date);
  return `${year}-${month}-${day}`;
}

/** Clock time with seconds, e.g. "10:42:18" (the live indicator). */
export function clockTime(date: Date): string {
  const { hour, minute, second } = berlinParts(date);
  return `${hour}:${minute}:${second}`;
}

/** Hours and minutes, e.g. "10:41". */
export function hourMinute(date: Date): string {
  const { hour, minute } = berlinParts(date);
  return `${hour}:${minute}`;
}

/** Day, month and time without the year, e.g. "30.09. 17:05" (de) or "30/09 17:05" (en). */
export function dayStamp(iso: string, locale: Locale): string {
  const date = parse(iso);
  if (!date) return iso;
  const { day, month } = berlinParts(date);
  const prefix = locale === "de" ? `${day}.${month}.` : `${day}/${month}`;
  return `${prefix} ${hourMinute(date)}`;
}

/** Only the time for today, otherwise day and time, e.g. "10:41" or "30.09. 17:05". */
export function shortStamp(iso: string, now: Date, locale: Locale): string {
  const date = parse(iso);
  if (!date) return iso;
  return dayKey(date) === dayKey(now) ? hourMinute(date) : dayStamp(iso, locale);
}

export interface RelativeTexts {
  /** Less than a minute ago. */
  justNow: string;
  /** E.g. "vor {count} Min.". */
  minutes: string;
  /** E.g. "vor {count} Std.". */
  hours: string;
  /** E.g. "gestern {time}". */
  yesterday: string;
}

/**
 * How long ago something happened, as the pass table shows it: "gerade eben", "vor 4 Min.",
 * "vor 2 Std." (same day), "gestern 21:15", older than that day and time.
 */
export function relativeTime(iso: string, now: Date, texts: RelativeTexts, locale: Locale): string {
  const date = parse(iso);
  if (!date) return iso;
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return texts.justNow;
  if (minutes < 60) return fill(texts.minutes, { count: minutes });
  if (dayKey(date) === dayKey(now)) return fill(texts.hours, { count: Math.floor(minutes / 60) });
  // The day before today's German date; from noon UTC a day back never skips a day, even
  // when the switch to or from summer time makes a day 23 or 25 hours long.
  const noon = new Date(`${dayKey(now)}T12:00:00Z`);
  const previous = dayKey(new Date(noon.getTime() - 24 * 60 * 60 * 1000));
  if (dayKey(date) === previous) {
    return fill(texts.yesterday, { time: hourMinute(date) });
  }
  return dayStamp(iso, locale);
}
