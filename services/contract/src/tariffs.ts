import type { Division, MeterUnit } from "@kundenportal/events";
import { daysBetween } from "./dates.js";

/** One selectable option of a tariff; prices are integer cents. */
export interface TariffOption {
  id: string;
  /** German name of the option, shown in the catalogue. */
  label: string;
  /** Metered divisions: monthly base price. Telco: the fixed monthly price. */
  monthlyPriceCent: number;
  /** Metered divisions only: price per kWh or m³. */
  workPriceCent?: number;
  /** Mobile only: included data volume per month. */
  dataVolumeMb?: number;
  /** Internet only: bandwidth. */
  bandwidthMbit?: number;
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
      { id: "standard", label: "Standard", monthlyPriceCent: 1200, workPriceCent: 32 },
      { id: "oeko", label: "Ökostrom", monthlyPriceCent: 1200, workPriceCent: 34 },
    ],
  },
  gas: {
    tariffName: "Gas Komfort",
    unit: "m3",
    minimumTermMonths: 12,
    options: [
      { id: "standard", label: "Standard", monthlyPriceCent: 1400, workPriceCent: 113 },
      { id: "klima", label: "Klimaneutral", monthlyPriceCent: 1400, workPriceCent: 118 },
    ],
  },
  water: {
    tariffName: "Wasser Basis",
    unit: "m3",
    minimumTermMonths: 12,
    options: [{ id: "standard", label: "Standard", monthlyPriceCent: 800, workPriceCent: 250 }],
  },
  internet: {
    tariffName: "Internet Zuhause",
    minimumTermMonths: 24,
    options: [
      { id: "100", label: "100 Mbit/s", monthlyPriceCent: 3499, bandwidthMbit: 100 },
      { id: "250", label: "250 Mbit/s", monthlyPriceCent: 4499, bandwidthMbit: 250 },
      { id: "1000", label: "1 Gbit/s", monthlyPriceCent: 6999, bandwidthMbit: 1000 },
    ],
  },
  mobile: {
    tariffName: "Mobil Flex",
    minimumTermMonths: 24,
    options: [
      { id: "10gb", label: "10 GB", monthlyPriceCent: 1499, dataVolumeMb: 10240 },
      { id: "20gb", label: "20 GB", monthlyPriceCent: 1999, dataVolumeMb: 20480 },
      { id: "40gb", label: "40 GB", monthlyPriceCent: 2999, dataVolumeMb: 40960 },
    ],
  },
};

export function tariffOption(division: Division, id: string): TariffOption | undefined {
  return TARIFFS[division].options.find((option) => option.id === id);
}

/** The prices the installment rule needs (a tariff option or a product's option). */
export interface OptionPrices {
  monthlyPriceCent: number;
  workPriceCent?: number | undefined;
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
  option: OptionPrices,
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
  option: OptionPrices,
): number {
  if (!option.workPriceCent) return 0;
  return Math.max(
    0,
    Math.round((12 * (installmentCent - option.monthlyPriceCent)) / option.workPriceCent),
  );
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

/**
 * Typical consumption per year a new order starts with (until the first meter reading
 * replaces it): a two-person household's electricity, a flat's gas, a household's water.
 */
export const DEFAULT_ANNUAL_CONSUMPTION: Partial<Record<Division, number>> = {
  electricity: 2800,
  gas: 1200,
  water: 80,
};
