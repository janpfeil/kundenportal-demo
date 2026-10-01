import type { Division, MeterUnit } from "@kundenportal/events";
import { type MeterReading, todayInGermany } from "./model.js";

/**
 * Consumption history of a metered contract (`GET /contracts/{contractId}/consumption`):
 * monthly values, key figures, the next reading due and the plausible range of a reading
 * taken today. Pure functions; the caller passes the readings, the contract's annual
 * estimate and the clock.
 *
 * How the monthly values come about (docs/wiki/design.md, "Wie die Monatswerte entstehen"):
 * 1. Every day has a weight: the month's share of the division's standard load profile
 *    divided by the days of that month. The weights of any calendar year sum to 1.
 * 2. Each span between two consecutive readings `[readAt₁, readAt₂)` spreads
 *    `value₂ − value₁` over its days in proportion to their weights.
 * 3. Days no span covers (before the first or after the latest reading, or in a span
 *    whose value went down) are estimated: annual consumption × day weight.
 * 4. A month's value is the sum of its days. Its basis is `estimate` if more than half
 *    of its days are estimated, otherwise `readings`.
 */

export type Basis = "readings" | "estimate";
export type MeteredDivision = "electricity" | "gas" | "water";

/** Mirrors `ConsumptionMonth` in the OpenAPI contract. */
export interface ConsumptionMonth {
  month: string;
  value: number;
  previousYear: number;
  basis: Basis;
  previousBasis: Basis;
}

/** Mirrors `ConsumptionHistory` in the OpenAPI contract. */
export interface ConsumptionHistory {
  contractId: string;
  unit: MeterUnit;
  months: ConsumptionMonth[];
  total: number;
  previousTotal: number;
  changePercent?: number;
  averagePerMonth: number;
  latestReading?: MeterReading;
  nextReadingDue: string;
  readingDue: boolean;
  plausibleRange?: { min: number; max: number; at: string };
}

export function isMeteredDivision(division: Division): division is MeteredDivision {
  return division === "electricity" || division === "gas" || division === "water";
}

const normalise = (shares: number[]) => {
  const sum = shares.reduce((a, b) => a + b, 0);
  return shares.map((share) => share / sum);
};

/**
 * Share of the annual consumption per calendar month (January first), normalised to 1.
 * Electricity: household profile H0. Gas: heating profile. Water: nearly flat, a little
 * more in summer (garden, showers).
 */
export const MONTHLY_SHARES: Record<MeteredDivision, readonly number[]> = {
  electricity: normalise([
    0.099, 0.087, 0.089, 0.079, 0.075, 0.07, 0.072, 0.073, 0.075, 0.084, 0.094, 0.103,
  ]),
  gas: normalise([0.17, 0.145, 0.125, 0.08, 0.045, 0.02, 0.015, 0.015, 0.03, 0.075, 0.12, 0.16]),
  water: normalise([
    0.08, 0.074, 0.081, 0.082, 0.087, 0.089, 0.093, 0.092, 0.084, 0.082, 0.078, 0.078,
  ]),
};

/**
 * Annual consumption assumed when neither the readings nor the contract say more — for
 * projections stored before `ContractChanged` carried `estimatedAnnualConsumption`
 * (phase 6). Typical German households: electricity 2 500 kWh, gas 12 000 kWh
 * (≈ 1 200 m³, the portal meters gas in m³), water 100 m³.
 */
export function defaultAnnualConsumption(division: MeteredDivision, unit: MeterUnit): number {
  switch (division) {
    case "electricity":
      return unit === "kWh" ? 2500 : 250;
    case "gas":
      return unit === "kWh" ? 12000 : 1200;
    case "water":
      return 100;
  }
}

/** Readings must be at least this far apart before they replace the contract's estimate. */
export const MIN_DAYS_FOR_ESTIMATE = 30;
/** Readings are due quarterly; an overdue reading is due within this many days. */
export const READING_INTERVAL_MONTHS = 3;
export const READING_GRACE_DAYS = 14;
/** Extra room above the plausible maximum, in days of average consumption. */
export const PLAUSIBLE_TOLERANCE_DAYS = 2;

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 of an ISO date (UTC, so no daylight saving gaps). */
const dayOf = (date: string) => Math.round(Date.parse(`${date}T00:00:00.000Z`) / DAY_MS);
const dateOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const daysInMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** `2026-10` shifted by `delta` months. */
export function addMonthsToMonth(month: string, delta: number): string {
  const [year = 0, monthNumber = 1] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Adds months to a date, clamped to the end of the target month (30.11. + 3 → 28.02.). */
export function addMonthsToDate(date: string, months: number): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const last = daysInMonth(year, month - 1 + months);
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, last)))
    .toISOString()
    .slice(0, 10);
}

/** Weight of one day: its month's share divided by the days of that month. */
function dayWeight(shares: readonly number[], day: number): number {
  const date = new Date(day * DAY_MS);
  const monthIndex = date.getUTCMonth();
  return (shares[monthIndex] ?? 0) / daysInMonth(date.getUTCFullYear(), monthIndex);
}

/** Sum of the day weights in `[from, to)`. */
function weightBetween(shares: readonly number[], from: number, to: number): number {
  let sum = 0;
  for (let day = from; day < to; day += 1) sum += dayWeight(shares, day);
  return sum;
}

/** Readings oldest first; on the same date only the last submitted counts. */
function readingPoints(readings: readonly MeterReading[]): { day: number; value: number }[] {
  const byDate = new Map<string, number>();
  for (const reading of sortReadings(readings)) byDate.set(reading.readAt, reading.value);
  return [...byDate].map(([date, value]) => ({ day: dayOf(date), value }));
}

function sortReadings(readings: readonly MeterReading[]): MeterReading[] {
  return [...readings].sort(
    (a, b) =>
      a.readAt.localeCompare(b.readAt) ||
      a.submittedAt.localeCompare(b.submittedAt) ||
      a.readingId.localeCompare(b.readingId),
  );
}

/**
 * Annual consumption to estimate uncovered days with: extrapolated from the readings
 * with the load profile (latest reading against the newest one at least a year older,
 * else the oldest one, if at least 30 days apart), else the contract's estimate, else
 * the division's default. The contract domain only re-publishes its own estimate in
 * `InstallmentAdjusted`, which the consumption domain does not receive; the readings
 * are its own and newer anyway.
 */
export function annualConsumption(
  division: MeteredDivision,
  unit: MeterUnit,
  readings: readonly MeterReading[],
  contractEstimate: number | undefined,
): number {
  const shares = MONTHLY_SHARES[division];
  const points = readingPoints(readings);
  const latest = points.at(-1);
  if (latest) {
    const older = points.filter((p) => latest.day - p.day >= MIN_DAYS_FOR_ESTIMATE);
    const reference = older.filter((p) => latest.day - p.day >= 365).at(-1) ?? older[0];
    if (reference && latest.value >= reference.value) {
      const weight = weightBetween(shares, reference.day, latest.day);
      if (weight > 0) return (latest.value - reference.value) / weight;
    }
  }
  return contractEstimate ?? defaultAnnualConsumption(division, unit);
}

/** kWh in whole numbers, m³ to one decimal. */
const decimalsOf = (unit: MeterUnit) => (unit === "m3" ? 1 : 0);
const roundTo = (value: number, decimals: number, mode: "round" | "floor" | "ceil" = "round") => {
  const factor = 10 ** decimals;
  const rounded = Math[mode](Math.round(value * factor * 1e6) / 1e6) / factor;
  return rounded === 0 ? 0 : rounded; // no -0
};

export interface HistoryInput {
  contractId: string;
  division: MeteredDivision;
  unit: MeterUnit;
  /** The contract's readings in any order. */
  readings: readonly MeterReading[];
  /** From the contract projection; missing in projections older than phase 6. */
  estimatedAnnualConsumption?: number | undefined;
  now: Date;
}

interface MonthSum {
  value: number;
  basis: Basis;
}

/**
 * Monthly values from the first day of `fromMonth` up to (excluding) `toMonth`, keyed by
 * `YYYY-MM`: covered days from the reading spans, the rest estimated.
 */
function monthSums(
  shares: readonly number[],
  points: readonly { day: number; value: number }[],
  annual: number,
  fromMonth: string,
  toMonth: string,
): Map<string, MonthSum> {
  const start = dayOf(`${fromMonth}-01`);
  const end = dayOf(`${toMonth}-01`);
  const covered = new Array<number | undefined>(end - start).fill(undefined);
  for (let i = 1; i < points.length; i += 1) {
    const [a, b] = [points[i - 1], points[i]];
    if (!a || !b || b.value < a.value) continue; // meter exchange or typo: estimate instead
    const weight = weightBetween(shares, a.day, b.day);
    if (weight <= 0) continue;
    for (let day = Math.max(a.day, start); day < Math.min(b.day, end); day += 1) {
      covered[day - start] = ((b.value - a.value) * dayWeight(shares, day)) / weight;
    }
  }

  const sums = new Map<string, MonthSum>();
  for (let month = fromMonth; month < toMonth; month = addMonthsToMonth(month, 1)) {
    const first = dayOf(`${month}-01`);
    const next = dayOf(`${addMonthsToMonth(month, 1)}-01`);
    let value = 0;
    let estimated = 0;
    for (let day = first; day < next; day += 1) {
      const fromReadings = covered[day - start];
      if (fromReadings === undefined) {
        value += annual * dayWeight(shares, day);
        estimated += 1;
      } else {
        value += fromReadings;
      }
    }
    sums.set(month, { value, basis: estimated * 2 > next - first ? "estimate" : "readings" });
  }
  return sums;
}

/**
 * The last 12 complete months before the current German month (on 2026-10-01: 2025-10 …
 * 2026-09) with the same months a year earlier, key figures, the next reading due and the
 * plausible range of a reading taken today.
 */
export function consumptionHistory(input: HistoryInput): ConsumptionHistory {
  const { division, unit, readings } = input;
  const shares = MONTHLY_SHARES[division];
  const decimals = decimalsOf(unit);
  const today = todayInGermany(input.now);
  const currentMonth = today.slice(0, 7);
  const annual = annualConsumption(division, unit, readings, input.estimatedAnnualConsumption);
  const points = readingPoints(readings);

  const sums = monthSums(shares, points, annual, addMonthsToMonth(currentMonth, -24), currentMonth);
  const months: ConsumptionMonth[] = [];
  for (let offset = -12; offset < 0; offset += 1) {
    const month = addMonthsToMonth(currentMonth, offset);
    const current = sums.get(month);
    const previous = sums.get(addMonthsToMonth(month, -12));
    if (!current || !previous) throw new Error(`Month ${month} missing`);
    months.push({
      month,
      value: roundTo(current.value, decimals),
      previousYear: roundTo(previous.value, decimals),
      basis: current.basis,
      previousBasis: previous.basis,
    });
  }

  // Sums of the rounded months, so a table of the months adds up to the total.
  const total = roundTo(
    months.reduce((sum, m) => sum + m.value, 0),
    decimals,
  );
  const previousTotal = roundTo(
    months.reduce((sum, m) => sum + m.previousYear, 0),
    decimals,
  );
  const history: ConsumptionHistory = {
    contractId: input.contractId,
    unit,
    months,
    total,
    previousTotal,
    averagePerMonth: roundTo(total / 12, decimals),
    ...readingSchedule(today, sortReadings(readings).at(-1)),
  };
  if (previousTotal > 0) {
    history.changePercent = roundTo(((total - previousTotal) / previousTotal) * 100, 1);
  }
  const latest = history.latestReading;
  if (latest) history.plausibleRange = plausibleRange(shares, annual, decimals, latest, today);
  return history;
}

/**
 * Quarterly reading: due three months after the latest reading; if that date has passed
 * (or there is no reading at all), within the next 14 days. `readingDue` once the due
 * date is at most 14 days away.
 */
export function readingSchedule(
  today: string,
  latest: MeterReading | undefined,
): Pick<ConsumptionHistory, "latestReading" | "nextReadingDue" | "readingDue"> {
  const regular = latest ? addMonthsToDate(latest.readAt, READING_INTERVAL_MONTHS) : undefined;
  const nextReadingDue =
    regular && regular >= today ? regular : dateOf(dayOf(today) + READING_GRACE_DAYS);
  return {
    ...(latest ? { latestReading: latest } : {}),
    nextReadingDue,
    readingDue: dayOf(nextReadingDue) - dayOf(today) <= READING_GRACE_DAYS,
  };
}

/**
 * Range a reading taken today should lie in: the latest value plus a third to three
 * times the consumption expected since then (annual × day weights), plus two days of
 * average consumption on top so a second reading on the same day is plausible. Only a
 * hint for the form; the server rejects nothing but values below the latest reading.
 */
export function plausibleRange(
  shares: readonly number[],
  annual: number,
  decimals: number,
  latest: MeterReading,
  today: string,
): { min: number; max: number; at: string } {
  const expected = annual * weightBetween(shares, dayOf(latest.readAt), dayOf(today));
  const tolerance = Math.max((annual * PLAUSIBLE_TOLERANCE_DAYS) / 365, 10 ** -decimals);
  return {
    min: Math.max(latest.value, roundTo(latest.value + expected / 3, decimals, "floor")),
    max: roundTo(latest.value + 3 * expected + tolerance, decimals, "ceil"),
    at: today,
  };
}
