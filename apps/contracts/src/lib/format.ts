import { formatEuro } from "@kundenportal/ui";
import type { Locale } from "@kundenportal/ui/i18n";

/** An amount in cents without decimals when it is whole euros, e.g. 6000 → "60 €" (de). */
export function formatWholeEuro(cents: number, locale: Locale): string {
  if (cents % 100 !== 0) return formatEuro(cents, locale);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** The unit as people write it ("m³" instead of the API's "m3"). */
export function unitLabel(unit: string): string {
  return unit === "m3" ? "m³" : unit;
}

/**
 * The contract has no separate contract number in the API; its id's first block serves as a
 * short, readable reference (the full id is the title of the element).
 */
export function shortContractId(contractId: string): string {
  return (contractId.split("-")[0] ?? contractId).toUpperCase();
}
