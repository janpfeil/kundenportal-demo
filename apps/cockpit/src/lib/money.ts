/*
 * Amounts and units as the operator's pages show and take them. Prices travel as cents
 * (the API's integers; a work price may carry fractions of a cent); the forms take euros
 * with a decimal comma or point. Free of server APIs: forms, pages and tests share it.
 */

import { formatCent, formatEuro } from "@kundenportal/ui";
import type { Locale } from "@kundenportal/ui/i18n";

/** The written unit of a meter, e.g. "m3" → "m³". */
export function unitLabel(unit: string): string {
  return unit === "m3" ? "m³" : unit;
}

/** A work price per unit, e.g. "32,4 ct/kWh". */
export function formatWorkPrice(cents: number, unit: string, locale: Locale): string {
  return `${formatCent(cents, locale)}/${unitLabel(unit)}`;
}

/** A monthly amount, e.g. "12,00 €". */
export function formatMonthly(cents: number, locale: Locale): string {
  return formatEuro(cents, locale);
}

/**
 * Contracts have no number of their own; the first block of the id serves as a short,
 * readable reference, as on the customer's pages (the full id is the element's title).
 */
export function shortId(id: string): string {
  return (id.split("-")[0] ?? id).toUpperCase();
}

const DECIMAL = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const FRACTION = /^\d{1,5}(?:[.,]\d{1,3})?$/;

/** "87", "87,5" or "87.50" euros as cents (8750); undefined for anything else. */
export function parseEuro(text: string): number | undefined {
  const value = text.trim().replace(/\s|€/g, "");
  if (!DECIMAL.test(value)) return undefined;
  return Math.round(Number(value.replace(",", ".")) * 100);
}

/** A price in cents with up to three decimals, e.g. "32,4" → 32.4; undefined otherwise. */
export function parseCent(text: string): number | undefined {
  const value = text.trim().replace(/\s|ct/g, "");
  if (!FRACTION.test(value)) return undefined;
  return Math.round(Number(value.replace(",", ".")) * 1000) / 1000;
}

/** Cents as the text of a euro field, e.g. 1200 → "12,00" (de) or "12.00" (en). */
export function euroInput(cents: number, locale: Locale): string {
  const text = (cents / 100).toFixed(2);
  return locale === "de" ? text.replace(".", ",") : text;
}

/** Cents as the text of a cent field, e.g. 32.4 → "32,4" (de). */
export function centInput(cents: number, locale: Locale): string {
  const text = String(Math.round(cents * 1000) / 1000);
  return locale === "de" ? text.replace(".", ",") : text;
}
