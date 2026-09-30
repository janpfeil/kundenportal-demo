import type { Division, MeterUnit } from "@kundenportal/events";

/** One selectable option of a tariff; prices are integer cents. */
export interface TariffOption {
  id: string;
  /** Metered divisions: monthly base price. Telco: the fixed monthly price. */
  monthlyPriceCent: number;
  /** Metered divisions only: price per kWh or m³. */
  workPriceCent?: number;
  /** Mobile only: included data volume per month. */
  dataVolumeMb?: number;
}

export interface Tariff {
  tariffName: string;
  /** Metered divisions have a unit and an installment the customer may adjust. */
  unit?: MeterUnit;
  minimumTermMonths: number;
  options: TariffOption[];
}

/**
 * Demo tariff catalogue per division. Plausible, not real: prices roughly follow
 * German household tariffs in 2026 (fachkonzept §1: "plausibel vereinfacht").
 */
export const TARIFFS: Record<Division, Tariff> = {
  electricity: {
    tariffName: "Strom Klassik",
    unit: "kWh",
    minimumTermMonths: 12,
    options: [
      { id: "standard", monthlyPriceCent: 1200, workPriceCent: 32 },
      { id: "oeko", monthlyPriceCent: 1200, workPriceCent: 34 },
    ],
  },
  gas: {
    tariffName: "Gas Komfort",
    unit: "m3",
    minimumTermMonths: 12,
    options: [
      { id: "standard", monthlyPriceCent: 1400, workPriceCent: 113 },
      { id: "klima", monthlyPriceCent: 1400, workPriceCent: 118 },
    ],
  },
  water: {
    tariffName: "Wasser Basis",
    unit: "m3",
    minimumTermMonths: 12,
    options: [{ id: "standard", monthlyPriceCent: 800, workPriceCent: 250 }],
  },
  internet: {
    tariffName: "Internet Zuhause",
    minimumTermMonths: 24,
    options: [
      { id: "100", monthlyPriceCent: 3499 },
      { id: "250", monthlyPriceCent: 4499 },
      { id: "1000", monthlyPriceCent: 6999 },
    ],
  },
  mobile: {
    tariffName: "Mobil Flex",
    minimumTermMonths: 24,
    options: [
      { id: "10gb", monthlyPriceCent: 1499, dataVolumeMb: 10240 },
      { id: "20gb", monthlyPriceCent: 1999, dataVolumeMb: 20480 },
      { id: "40gb", monthlyPriceCent: 2999, dataVolumeMb: 40960 },
    ],
  },
};

export function tariffOption(division: Division, id: string): TariffOption | undefined {
  return TARIFFS[division].options.find((option) => option.id === id);
}

/** Share of the recommended installment a customer may choose, in whole euros. */
export const INSTALLMENT_RANGE = { min: 0.8, max: 1.5 } as const;

/** Readings closer than this to the reference are too short to extrapolate a year. */
export const MIN_DAYS_FOR_ESTIMATE = 30;

const euroUp = (cents: number) => Math.ceil(cents / 100) * 100;
const euroDown = (cents: number) => Math.floor(cents / 100) * 100;

/**
 * Recommended monthly installment of a metered contract:
 * (annual consumption × work price + 12 × monthly base price) / 12, rounded up to a
 * whole euro.
 */
export function recommendedInstallment(
  annualConsumption: number,
  option: TariffOption,
): { installmentCent: number; minCent: number; maxCent: number } {
  const yearly = annualConsumption * (option.workPriceCent ?? 0) + 12 * option.monthlyPriceCent;
  const installmentCent = euroUp(yearly / 12);
  return {
    installmentCent,
    minCent: Math.max(100, euroDown(installmentCent * INSTALLMENT_RANGE.min)),
    maxCent: euroUp(installmentCent * INSTALLMENT_RANGE.max),
  };
}

/**
 * Annual consumption an installment was calculated for (inverse of
 * {@link recommendedInstallment}); used for contracts taken over from a legacy system,
 * which bring an installment but no estimate.
 */
export function annualConsumptionFromInstallment(
  installmentCent: number,
  option: TariffOption,
): number {
  if (!option.workPriceCent) return 0;
  return Math.max(
    0,
    Math.round((12 * (installmentCent - option.monthlyPriceCent)) / option.workPriceCent),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two ISO dates (`to` minus `from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/**
 * Extrapolates the annual consumption from the reference reading (contract start) and a
 * new reading: consumption per day × 365, rounded. `undefined` if the interval is shorter
 * than {@link MIN_DAYS_FOR_ESTIMATE} days or the meter ran backwards.
 */
export function estimateAnnualConsumption(
  reference: { value: number; readAt: string },
  reading: { value: number; readAt: string },
): number | undefined {
  const days = daysBetween(reference.readAt, reading.readAt);
  const consumed = reading.value - reference.value;
  if (days < MIN_DAYS_FOR_ESTIMATE || consumed < 0) return undefined;
  return Math.round((consumed * 365) / days);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}
