/**
 * Texts of the public shell pages that are prerendered once for all visitors (start page,
 * redeem page). The browser picks the language, so both languages ship with these pages;
 * everything else stays in the server-side dictionary (`./index`).
 */
import type { Locale } from "@kundenportal/ui/i18n";
import { publicDe } from "./public-de";
import { publicEn } from "./public-en";

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type PublicTexts = Widen<typeof publicDe>;
export type RedeemTexts = PublicTexts["redeem"];

export const publicTexts: Record<Locale, PublicTexts> = { de: publicDe, en: publicEn };
