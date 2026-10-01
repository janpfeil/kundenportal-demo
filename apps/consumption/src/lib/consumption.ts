import type { Contract } from "@kundenportal/api-contract";
import type { KpiDelta } from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";

/** Short name of a month (`YYYY-MM`) from the dictionary's list, e.g. "2025-10" → "Okt". */
export function monthLabel(month: string, names: readonly string[]): string {
  const index = Number(month.slice(5, 7)) - 1;
  return names[index] ?? month;
}

/** "Okt 2025 – Sep 2026" for the first and last month of the chart. */
export function monthRange(
  months: readonly { month: string }[],
  names: readonly string[],
  template: string,
): string {
  const first = months[0]?.month;
  const last = months[months.length - 1]?.month;
  if (!first || !last) return "";
  const label = (month: string) => `${monthLabel(month, names)} ${month.slice(0, 4)}`;
  return fill(template, { from: label(first), to: label(last) });
}

/**
 * The change against the previous year as the key figure shows it ("−4,1 % zum Vorjahr"),
 * with a real minus sign. Less consumption is good news; more is just shown.
 */
export function changeDelta(changePercent: number, locale: Locale, template: string): KpiDelta {
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  })
    .format(changePercent)
    .replace("-", "−");
  return {
    text: fill(template, { change: number }),
    tone: changePercent < 0 ? "good" : "neutral",
  };
}

/** Monthly cost of an average month at the unit price, in whole euros, e.g. "71 €". */
export function monthlyCost(
  averagePerMonth: number,
  workPriceCent: number,
  locale: Locale,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format((averagePerMonth * workPriceCent) / 100);
}

/** A unit price in cents as the mockup shows it, e.g. 32.4 → "32,4 ct" (de). */
export function formatCent(cents: number, locale: Locale): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(cents)} ct`;
}

/** The unit as people write it ("m³" instead of the API's "m3"). */
export function unitLabel(unit: string): string {
  return unit === "m3" ? "m³" : unit;
}

/** Contracts with a meter and a unit: they get readings, a chart and the reading form. */
export function isMetered(contract: Contract): boolean {
  return Boolean(contract.meterNumber && contract.unit);
}

/** Contracts with a data volume (mobile). */
export function hasDataVolume(contract: Contract): boolean {
  return contract.dataVolumeMb !== undefined;
}

/** The tabs' order: metered contracts first, then the mobile ones, each in the API's order. */
export function tabContracts(contracts: readonly Contract[]): Contract[] {
  return [
    ...contracts.filter(isMetered),
    ...contracts.filter((contract) => !isMetered(contract) && hasDataVolume(contract)),
  ];
}

/** Query parameter that names the selected contract, e.g. `/verbrauch?vertrag=<id>`. */
export const TAB_PARAM = "vertrag";

/**
 * The tab to show:the one named by `?vertrag=` if it is one of the tabs, else the first, so
 * a reload after submitting a reading stays on its contract.
 */
export function selectedTab(
  ids: readonly string[],
  requested: string | string[] | undefined,
): string | undefined {
  const wanted = Array.isArray(requested) ? requested[0] : requested;
  return wanted && ids.includes(wanted) ? wanted : ids[0];
}

/**
 * Whether a reading the customer is typing lies outside the range the API expects for
 * today. Only a hint: the server decides, and only rejects values below the latest reading.
 */
export function isImplausible(
  valueInput: string,
  readAt: string,
  range: { min: number; max: number; at: string } | undefined,
): boolean {
  if (!range || readAt !== range.at) return false;
  const text = valueInput.trim().replace(",", ".");
  if (text === "") return false;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return false;
  return value < range.min || value > range.max;
}

/** The billing period of a month (`YYYY-MM`), e.g. "01.–31.10.2026" (de). */
export function billingPeriod(month: string, locale: Locale): string {
  const [year, number] = month.split("-").map(Number);
  if (!year || !number) return month;
  const start = new Date(Date.UTC(year, number - 1, 1));
  const end = new Date(Date.UTC(year, number, 0));
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(start, end);
}

/**
 * A data volume with one decimal from 1 GB on ("12,4 GB", "20 GB"), so the ring's label, the
 * remaining volume and the number in the middle agree.
 */
export function formatVolume(megabytes: number, locale: Locale): string {
  if (megabytes < 1024)
    return new Intl.NumberFormat(locale, { style: "unit", unit: "megabyte" }).format(
      Math.round(megabytes),
    );
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "gigabyte",
    maximumFractionDigits: 1,
  }).format(megabytes / 1024);
}

/** A data volume in MB as a bare number of GB with one decimal, e.g. 12698 → "12,4". */
export function gigabytes(megabytes: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(megabytes / 1024);
}
