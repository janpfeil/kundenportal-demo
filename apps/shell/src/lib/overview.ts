/*
 * Pure helpers of the signed-in pages (overview, mailbox, pass): how API data becomes what
 * the mockup shows (docs/design/mockups.html, screens "konto", "postfach", "pass"). No I/O,
 * so every rule is unit-tested in overview.test.ts.
 */
import type {
  Contract,
  Customer,
  DataUsage,
  Division,
  Notification,
  components,
} from "@kundenportal/api-contract";
import type { Locale } from "@kundenportal/ui/i18n";

export type ConsumptionHistory = components["schemas"]["ConsumptionHistory"];

/** Dates and times on the portal are German time, wherever the server runs. */
export const TIME_ZONE = "Europe/Berlin";

/** Divisions measured by a meter: they have readings, a consumption history and an installment. */
export const METERED: ReadonlySet<Division> = new Set(["electricity", "gas", "water"]);

/** Today as the overview's eyebrow: "Mittwoch, 1. Oktober 2026" (German time). */
export function longDate(now: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(now);
}

/** Calendar day of `date` in German time as `YYYY-MM-DD`. */
export function dayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The calendar day before `key` (`YYYY-MM-DD`), independent of time zones and DST. */
function previousDay(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) - 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * Time of a message in a list, as the mockup shows it: the time for today ("09:14"),
 * "gestern" for yesterday, else the day ("28.09.").
 */
export function messageTime(
  createdAt: string,
  now: Date,
  locale: Locale,
  yesterday: string,
): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const day = dayKey(date);
  const today = dayKey(now);
  if (day === today) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: TIME_ZONE,
    }).format(date);
  }
  if (day === previousDay(today)) return yesterday;
  return new Intl.DateTimeFormat(locale, {
    day: locale === "de" ? "2-digit" : "numeric",
    month: locale === "de" ? "2-digit" : "short",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** Date and time of an opened message: "Do., 01.10.2026, 09:14". */
export function messageDateTime(createdAt: string, locale: Locale): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** Messages newest first (the API's order is not part of the contract). */
export function newestFirst(items: readonly Notification[]): Notification[] {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** The message opened next to the list: the one named by `?n=`, else the newest. */
export function selectMessage(
  items: readonly Notification[],
  requested: string | string[] | undefined,
): Notification | undefined {
  const id = Array.isArray(requested) ? requested[0] : requested;
  return items.find((item) => item.notificationId === id) ?? newestFirst(items)[0];
}

/** A message body as paragraphs: blank lines (or single line breaks) separate them. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n|\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Banner "Zählerstand … fällig": the active metered contract whose reading is due first. */
export interface DueReading {
  contractId: string;
  division: Division;
  nextReadingDue: string;
}

export function dueReading(
  contracts: readonly Contract[],
  histories: ReadonlyMap<string, ConsumptionHistory>,
): DueReading | undefined {
  const due = contracts
    .filter((contract) => contract.status === "active" && METERED.has(contract.division))
    .map((contract) => ({ contract, history: histories.get(contract.contractId) }))
    .filter(({ history }) => history?.readingDue === true)
    .map(({ contract, history }) => ({
      contractId: contract.contractId,
      division: contract.division,
      nextReadingDue: history?.nextReadingDue ?? "",
    }))
    .sort((a, b) => a.nextReadingDue.localeCompare(b.nextReadingDue));
  return due[0];
}

/** What a contract card shows below the price. */
export type ContractTrend =
  | { kind: "sparkline"; values: number[]; min: number; max: number; unit: string }
  | { kind: "estimate"; annual: number; unit: string }
  | { kind: "usage"; usedMb: number; includedMb: number }
  | { kind: "none" };

export interface ContractCardView {
  contractId: string;
  division: Division;
  title: string;
  /** "Standard · Zähler …4471", the customer's phone number or the data volume. */
  sub: string;
  priceCent: number;
  /** "Abschlag / Monat" (metered) or "Monatspreis" (internet, mobile). */
  priceKind: "installment" | "monthly";
  trend: ContractTrend;
  status: Contract["status"];
}

const unitText = (unit: string | undefined) => (unit === "m3" ? "m³" : (unit ?? "kWh"));

/** Last four characters of a meter number, as the mockup's "Zähler …4471". */
export function meterTail(meterNumber: string): string {
  return meterNumber.replace(/\s+/g, "").slice(-4);
}

function trendOf(
  contract: Contract,
  history: ConsumptionHistory | undefined,
  usage: DataUsage | undefined,
): ContractTrend {
  if (contract.division === "mobile") {
    return usage
      ? { kind: "usage", usedMb: usage.usedMb, includedMb: usage.includedMb }
      : { kind: "none" };
  }
  if (!METERED.has(contract.division)) return { kind: "none" };
  const unit = unitText(history?.unit ?? contract.unit);
  // A line only where readings stand behind it; a profile of pure estimates says no more
  // than the annual figure.
  if (history && history.months.some((month) => month.basis === "readings")) {
    const values = history.months.map((month) => month.value);
    return {
      kind: "sparkline",
      values,
      min: Math.min(...values),
      max: Math.max(...values),
      unit,
    };
  }
  const annual = history ? history.total : contract.estimatedAnnualConsumption;
  return annual !== undefined && annual > 0 ? { kind: "estimate", annual, unit } : { kind: "none" };
}

/** One contract card of the overview, from the contract and what was loaded for it. */
export function contractCard(
  contract: Contract,
  customer: Pick<Customer, "phone"> | undefined,
  texts: { meter: string },
  history?: ConsumptionHistory,
  usage?: DataUsage,
  dataVolume?: (megabytes: number) => string,
): ContractCardView {
  const metered = METERED.has(contract.division);
  let sub = contract.tariffOption;
  if (metered && contract.meterNumber) {
    sub = `${contract.tariffOption} · ${texts.meter} …${meterTail(contract.meterNumber)}`;
  } else if (contract.division === "mobile") {
    sub =
      customer?.phone ??
      (contract.dataVolumeMb !== undefined && dataVolume
        ? dataVolume(contract.dataVolumeMb)
        : contract.tariffOption);
  }
  return {
    contractId: contract.contractId,
    division: contract.division,
    title: contract.tariffName,
    sub,
    priceCent: contract.monthlyInstallmentCent,
    priceKind: metered ? "installment" : "monthly",
    trend: trendOf(contract, history, usage),
    status: contract.status,
  };
}

/** Euro amount as on the cards: whole euros without cents ("87 €"), else with ("19,99 €"). */
export function cardPrice(cents: number, locale: Locale): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Used and included data volume in one unit, as "12,4" and "20" with "GB" (MB below 1 GB
 * included), so the card can say "12,4 von 20 GB verbraucht".
 */
export function volumePair(
  usedMb: number,
  includedMb: number,
  locale: Locale,
): { used: string; included: string; unit: "GB" | "MB" } {
  const gb = includedMb >= 1024;
  const scale = gb ? 1024 : 1;
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return {
    used: format.format(usedMb / scale),
    included: format.format(includedMb / scale),
    unit: gb ? "GB" : "MB",
  };
}

/** "Kunde seit": month and year ("März 2019"). */
export function monthYear(isoDateTime: string, locale: Locale): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

/**
 * The pass ring: time left against the pass's duration. Hours while at least one is left,
 * then minutes (short test passes); days above two days. The arc counts in hours.
 */
export interface PassRing {
  value: number;
  max: number;
  unit: "days" | "hours" | "minutes";
  amount: number;
  totalHours: number;
}

export function passRing(validUntil: string, totalHours: number, now = Date.now()): PassRing {
  const end = Date.parse(validUntil);
  const ms = Number.isNaN(end) ? 0 : Math.max(0, end - now);
  const hours = ms / 3_600_000;
  const max = Math.max(totalHours, Math.ceil(hours), 1);
  if (hours > 48 && hours > totalHours) {
    return { value: hours, max, unit: "days", amount: Math.ceil(hours / 24), totalHours: max };
  }
  if (hours >= 1) {
    return { value: hours, max, unit: "hours", amount: Math.ceil(hours), totalHours: max };
  }
  return { value: hours, max, unit: "minutes", amount: Math.ceil(ms / 60_000), totalHours: max };
}

/** Share of a quota in whole percent; quotas at or above `warnAt` deserve a warning. */
export function quotaShare(used: number, limit: number): number {
  return limit > 0 ? Math.round((used / limit) * 100) : 0;
}
