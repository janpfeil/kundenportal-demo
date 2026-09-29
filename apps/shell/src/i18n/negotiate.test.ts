import { describe, expect, it } from "vitest";
import { negotiateLocale } from "./index";

describe("negotiateLocale", () => {
  it("prefers the explicit choice", () => {
    expect(negotiateLocale("en", "de-DE,de;q=0.9")).toBe("en");
  });

  it("follows the browser's weighted preference", () => {
    expect(negotiateLocale(undefined, "fr-FR,en;q=0.8,de;q=0.5")).toBe("en");
    expect(negotiateLocale(undefined, "en;q=0.3,de-AT")).toBe("de");
  });

  it("falls back to German", () => {
    expect(negotiateLocale(undefined, null)).toBe("de");
    expect(negotiateLocale("fr", "fr-FR")).toBe("de");
  });
});
