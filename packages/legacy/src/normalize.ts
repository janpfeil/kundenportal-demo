import type { PostalAddress } from "@kundenportal/events";

/** Abbreviations legacy systems use in street names, expanded to the full word. */
const STREET_ABBREVIATIONS: [RegExp, string][] = [
  [/(^|[\s-])str\.?$/i, "$1Straße"],
  [/str\.?$/i, "straße"],
  [/(^|[\s-])strasse$/i, "$1Straße"],
  [/strasse$/i, "straße"],
  [/(^|[\s-])pl\.?$/i, "$1Platz"],
  [/pl\.?$/i, "platz"],
];

/** Expands abbreviations: `Hauptstr.` → `Hauptstraße`, `Marktpl.` → `Marktplatz`. */
export function expandStreet(street: string): string {
  const result = street.trim().replace(/\s+/g, " ");
  for (const [pattern, replacement] of STREET_ABBREVIATIONS) {
    if (pattern.test(result)) return result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Parses a one-line address like `Hauptstr. 5, 04103 Leipzig`. Returns the parts it
 * found; a missing postal code stays undefined (the record is then incomplete).
 */
export function parseAddressLine(line: string): {
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
} {
  const [streetPart = "", placePart = ""] = line.split(",").map((part) => part.trim());
  const street = /^(.*?)\s+(\d+\s?[a-zA-Z]?)$/.exec(streetPart);
  const place = /^(?:(\d{5})\s+)?(.+)$/.exec(placePart);
  return {
    ...(street?.[1] ? { street: expandStreet(street[1]) } : {}),
    ...(street?.[2] ? { houseNumber: street[2].replace(/\s/g, "").toLowerCase() } : {}),
    ...(place?.[1] ? { postalCode: place[1] } : {}),
    ...(place?.[2] ? { city: place[2].trim() } : {}),
  };
}

/** Folds case, umlauts and ß so differently written names compare equal. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Comparable key of an address: `Hauptstr. 5` and `Hauptstraße 5` yield the same key. */
export function addressKey(address: PostalAddress): string {
  return [fold(expandStreet(address.street)), fold(address.houseNumber), address.postalCode].join(
    "|",
  );
}

/** Formats an address for people: `Hauptstraße 5, 04103 Leipzig`. */
export function formatAddress(address: PostalAddress): string {
  return `${address.street} ${address.houseNumber}, ${address.postalCode} ${address.city}`;
}

/** `02.11.1979` → `1979-11-02`; anything else → undefined. */
export function germanDateToIso(value: string): string | undefined {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

/** Euros as decimal string or number → integer cents (`"87.00"` → 8700, `44.99` → 4499). */
export function toCents(euros: string | number): number {
  const value = typeof euros === "number" ? euros : Number(euros);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid amount ${euros}`);
  return Math.round(value * 100);
}
