/**
 * Shared translations of the portal: language negotiation and the texts every zone shows
 * (navigation, sign-in, language switch, footer). Zone-specific texts stay in the zones.
 */
import { de } from "./de.js";
import { en } from "./en.js";

export type Locale = "de" | "en";
export const LOCALES: readonly Locale[] = ["de", "en"];

/** Cookie holding the explicit language choice; shared by all zones on the same domain. */
export const LOCALE_COOKIE = "kp_locale";

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type CommonTexts = Widen<typeof de>;

export const commonTexts: Record<Locale, CommonTexts> = { de, en };

export function isLocale(value: unknown): value is Locale {
  return value === "de" || value === "en";
}

/** The language the switcher offers. */
export function otherLocale(locale: Locale): Locale {
  return locale === "de" ? "en" : "de";
}

/** Picks the UI language: explicit choice (cookie) first, then the browser's preference, else German. */
export function negotiateLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  const preferred = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.find((param) => param.trim().startsWith("q="));
      const weight = q ? Number(q.trim().slice(2)) : 1;
      return { language: tag.slice(0, 2).toLowerCase(), q: Number.isNaN(weight) ? 0 : weight };
    })
    .filter((entry) => isLocale(entry.language) && entry.q > 0)
    .sort((a, b) => b.q - a.q)[0];
  return (preferred?.language as Locale | undefined) ?? "de";
}
