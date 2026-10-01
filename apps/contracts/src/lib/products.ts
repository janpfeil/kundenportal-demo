/*
 * The product catalogue as the customer sees it: products grouped by division and the
 * prices of an option as short lines ("12,00 € Grundpreis / Monat", "32,4 ct/kWh").
 */
import type { Division, MeterUnit, components } from "@kundenportal/api-contract";
import { formatDataVolume, formatEuro } from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import { formatCent, unitLabel } from "./format";

export type Product = components["schemas"]["Product"];
export type ProductOption = components["schemas"]["ProductOption"];
export type ContractOrder = components["schemas"]["ContractOrder"];

/** Order of the divisions on the page, as in the navigation of the mockup. */
export const DIVISION_ORDER: readonly Division[] = [
  "electricity",
  "gas",
  "water",
  "internet",
  "mobile",
];

/** Divisions measured by a meter: an order needs the meter number and its reading. */
export const METERED: ReadonlySet<Division> = new Set(["electricity", "gas", "water"]);

/** Product ids as the API accepts them in paths and orders. */
export const PRODUCT_ID = /^[a-z0-9-]{2,40}$/;

export interface DivisionGroup {
  division: Division;
  products: Product[];
}

/**
 * Orderable products grouped by division, divisions in their fixed order; empty divisions
 * are left out. Products keep the API's order. Only `active` products are orderable, even
 * if the API ever sent others.
 */
export function groupByDivision(products: readonly Product[]): DivisionGroup[] {
  return DIVISION_ORDER.map((division) => ({
    division,
    products: products.filter(
      (product) => product.division === division && product.status === "active",
    ),
  })).filter((group) => group.products.length > 0);
}

/** The option named by `?option=`, else the product's first one. */
export function pickOption(product: Product, requested: unknown): ProductOption | undefined {
  const id = Array.isArray(requested) ? requested[0] : requested;
  return product.options.find((option) => option.optionId === id) ?? product.options[0];
}

/** Unit of the meter of a metered product: the product's own, else m³ for water, else kWh. */
export function meterUnit(product: Pick<Product, "division" | "unit">): MeterUnit {
  return product.unit ?? (product.division === "water" ? "m3" : "kWh");
}

export interface PriceTexts {
  basePrice: string;
  monthlyPrice: string;
  perMonth: string;
  workPrice: string;
  perUnit: string;
  dataVolume: string;
  bandwidth: string;
  bandwidthValue: string;
}

export interface OptionPrice {
  /** The monthly amount, e.g. "12,00 €". */
  amount: string;
  /** What the amount is, e.g. "Grundpreis / Monat". */
  amountLabel: string;
  /** Further prices and features, e.g. Arbeitspreis "32,4 ct/kWh". */
  lines: { term: string; value: string }[];
}

/** The prices and features of one option as the catalogue, the order and the contract show them. */
export function optionPrice(
  option: ProductOption,
  product: Pick<Product, "division" | "unit">,
  locale: Locale,
  texts: PriceTexts,
): OptionPrice {
  const metered = METERED.has(product.division);
  const lines: OptionPrice["lines"] = [];
  if (metered && option.workPriceCent !== undefined) {
    lines.push({
      term: texts.workPrice,
      value: fill(texts.perUnit, {
        price: formatCent(option.workPriceCent, locale),
        unit: unitLabel(meterUnit(product)),
      }),
    });
  }
  if (option.bandwidthMbit !== undefined) {
    lines.push({
      term: texts.bandwidth,
      value: fill(texts.bandwidthValue, {
        value: new Intl.NumberFormat(locale).format(option.bandwidthMbit),
      }),
    });
  }
  if (option.dataVolumeMb !== undefined) {
    lines.push({ term: texts.dataVolume, value: formatDataVolume(option.dataVolumeMb, locale) });
  }
  return {
    amount: formatEuro(option.monthlyPriceCent, locale),
    // "Grundpreis / Monat" for metered options; a monthly price needs no "/ Monat".
    amountLabel: metered ? fill(texts.perMonth, { label: texts.basePrice }) : texts.monthlyPrice,
    lines,
  };
}

/**
 * Names and short prices of a product's options for the contract change form: the unit
 * price of metered options ("32,4 ct/kWh"), else the monthly price ("14,99 €").
 */
export function optionInfo(
  product: Product,
  locale: Locale,
  texts: PriceTexts,
): Record<string, { label: string; price?: string }> {
  const metered = METERED.has(product.division);
  return Object.fromEntries(
    product.options.map((option) => {
      const price =
        metered && option.workPriceCent !== undefined
          ? fill(texts.perUnit, {
              price: formatCent(option.workPriceCent, locale),
              unit: unitLabel(meterUnit(product)),
            })
          : metered
            ? undefined
            : formatEuro(option.monthlyPriceCent, locale);
      return [option.optionId, price ? { label: option.label, price } : { label: option.label }];
    }),
  );
}

/** "1 Monat", "12 Monate" or "keine" for a duration in months. */
export function monthsText(
  count: number,
  texts: { none: string; oneMonth: string; months: string },
): string {
  if (count <= 0) return texts.none;
  return count === 1 ? texts.oneMonth : fill(texts.months, { count });
}
