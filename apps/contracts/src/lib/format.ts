import type { Locale } from "@kundenportal/ui/i18n";

/** An amount in euro cents as a localised euro amount, e.g. 8500 → "85,00 €" (de). */
export function formatEuro(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** A price per unit in cents, which may carry fractions of a cent, e.g. 32 → "0,32 €". */
export function formatUnitPrice(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cents / 100);
}

/** A calendar date (`YYYY-MM-DD`) in the locale's medium style, independent of time zones. */
export function formatDate(isoDate: string, locale: Locale): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

/** A point in time in German time, e.g. for upload timestamps. */
export function formatDateTime(isoDateTime: string, locale: Locale): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

/** A file size in kB or MB (decimal places only where they help). */
export function formatFileSize(bytes: number, locale: Locale): string {
  return bytes >= 1024 * 1024
    ? formatUnit(bytes / (1024 * 1024), "megabyte", locale)
    : formatUnit(Math.max(bytes / 1024, 0.1), "kilobyte", locale);
}

/** A consumption or meter value with its unit, e.g. 3500 kWh → "3.500 kWh" (de). */
export function formatQuantity(value: number, unit: string, locale: Locale): string {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  return `${number} ${unit === "m3" ? "m³" : unit}`;
}

/** A data volume in MB as GB (from 1 GB on) or MB. */
export function formatDataVolume(megabytes: number, locale: Locale): string {
  return megabytes >= 1024
    ? formatUnit(megabytes / 1024, "gigabyte", locale)
    : formatUnit(megabytes, "megabyte", locale);
}

function formatUnit(value: number, unit: string, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}
