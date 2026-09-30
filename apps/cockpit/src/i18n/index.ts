import {
  type CommonTexts,
  LOCALE_COOKIE,
  type Locale,
  commonTexts,
  negotiateLocale,
} from "@kundenportal/ui/i18n";
import { cookies, headers } from "next/headers";
import { de } from "./de";
import { en } from "./en";

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
/** Texts of this zone; navigation, sign-in, language switch and footer come from the UI library. */
export type Dictionary = Widen<typeof de>;
export type { Locale };

const dictionaries: Record<Locale, Dictionary> = { de, en };

export async function currentLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return negotiateLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get("accept-language"));
}

export async function dictionary(): Promise<{
  locale: Locale;
  t: Dictionary;
  common: CommonTexts;
}> {
  const locale = await currentLocale();
  return { locale, t: dictionaries[locale], common: commonTexts[locale] };
}
