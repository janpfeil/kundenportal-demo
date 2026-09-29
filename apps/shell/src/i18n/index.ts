import { cookies, headers } from "next/headers";
import { de } from "./de";
import { en } from "./en";

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Dictionary = Widen<typeof de>;
export type Locale = "de" | "en";

export const LOCALE_COOKIE = "kp_locale";
const dictionaries: Record<Locale, Dictionary> = { de, en };

/** Picks the UI language: explicit choice (cookie) first, then the browser's preference, else German. */
export function negotiateLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (cookieValue === "de" || cookieValue === "en") return cookieValue;
  const preferred = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.find((param) => param.trim().startsWith("q="));
      return { language: tag.slice(0, 2).toLowerCase(), q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((entry) => entry.language === "de" || entry.language === "en")
    .sort((a, b) => b.q - a.q)[0];
  return (preferred?.language as Locale | undefined) ?? "de";
}

export async function currentLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return negotiateLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get("accept-language"));
}

export async function dictionary(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await currentLocale();
  return { locale, t: dictionaries[locale] };
}
