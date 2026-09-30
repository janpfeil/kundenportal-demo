import { describe, expect, it } from "vitest";
import { commonTexts, isLocale, negotiateLocale, otherLocale } from "./index.js";

describe("negotiateLocale", () => {
  it("prefers the explicit choice", () => {
    expect(negotiateLocale("en", "de-DE,de;q=0.9")).toBe("en");
    expect(negotiateLocale("de", "en-US")).toBe("de");
  });

  it("follows the browser's weighted preference", () => {
    expect(negotiateLocale(undefined, "fr-FR,en;q=0.8,de;q=0.5")).toBe("en");
    expect(negotiateLocale(undefined, "en;q=0.3,de-AT")).toBe("de");
    expect(negotiateLocale(undefined, "EN-gb")).toBe("en");
  });

  it("ignores languages the browser rules out or weights unreadably", () => {
    expect(negotiateLocale(undefined, "en;q=0,de;q=0.1")).toBe("de");
    expect(negotiateLocale(undefined, "de;q=abc,en;q=0.2")).toBe("en");
  });

  it("falls back to German", () => {
    expect(negotiateLocale(undefined, null)).toBe("de");
    expect(negotiateLocale(undefined, undefined)).toBe("de");
    expect(negotiateLocale(undefined, "")).toBe("de");
    expect(negotiateLocale("fr", "fr-FR")).toBe("de");
  });
});

describe("locale helpers", () => {
  it("recognises only supported locales", () => {
    expect(isLocale("de")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("offers the other language in the switcher", () => {
    expect(otherLocale("de")).toBe("en");
    expect(otherLocale("en")).toBe("de");
    expect(commonTexts.de.language.switchTo).toBe("English");
    expect(commonTexts.en.language.switchTo).toBe("Deutsch");
  });
});
