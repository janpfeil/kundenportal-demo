import type { Locale } from "@kundenportal/ui/i18n";

/** A point in time in German time, e.g. `30.09.2026, 11:20`. */
export function formatDateTime(isoDateTime: string, locale: Locale): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Berlin",
  }).format(date);
}

/** Share of `part` in `total` as whole percent; 0 without a total. */
export function percent(part: number, total: number | undefined): number {
  if (!total) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}
