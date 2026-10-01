import { describe, expect, it } from "vitest";
import { commonTexts } from "./i18n/index.js";
import { isCurrentSection, portalNavigation } from "./navigation.js";

describe("isCurrentSection", () => {
  it("matches the start page only exactly, other sections with everything below", () => {
    expect(isCurrentSection("/", "/")).toBe(true);
    expect(isCurrentSection("/", "/konto")).toBe(false);
    expect(isCurrentSection("/pass", "/pass")).toBe(true);
    expect(isCurrentSection("/pass", "/pass/einloesen")).toBe(true);
    expect(isCurrentSection("/pass", "/passwort")).toBe(false);
    expect(isCurrentSection("/vertraege", "/vertraege/123?tab=x")).toBe(true);
    expect(isCurrentSection("/konto", undefined)).toBe(false);
  });
});

describe("portalNavigation", () => {
  it("shows the start page to everyone and marks it when current", () => {
    expect(portalNavigation(commonTexts.en, { signedIn: false, current: "/" })).toEqual([
      { href: "/", label: "Home", active: true },
    ]);
    expect(portalNavigation(commonTexts.en, { signedIn: false, current: "/vertraege" })).toEqual([
      { href: "/", label: "Home" },
    ]);
  });

  it("lists the signed-in sections plus extras and marks exactly the current one", () => {
    const nav = portalNavigation(commonTexts.de, {
      signedIn: true,
      current: "/cockpit/paesse",
      extra: [{ href: "/cockpit", label: "Cockpit" }],
    });
    expect(nav.map((item) => item.href)).toEqual([
      "/",
      "/postfach",
      "/vertraege",
      "/verbrauch",
      "/cockpit",
    ]);
    expect(nav.filter((item) => item.active).map((item) => item.href)).toEqual(["/cockpit"]);
  });
});
