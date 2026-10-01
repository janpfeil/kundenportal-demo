import { describe, expect, it } from "vitest";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import { parseRedrive } from "./redrive";
import { cockpitNavigation, cockpitShortcuts, markCurrent, navigation, zonePath } from "./zone";

/** An unsigned access token with the given Cognito groups (the navigation only reads it). */
const session = (...groups: string[]) => ({
  accessToken: `e30.${Buffer.from(JSON.stringify({ "cognito:groups": groups })).toString("base64url")}.x`,
});

const navTexts = { ...de.frame, passStatus: "Demo-Pass" };

describe("cockpit helpers", () => {
  it("accepts only known, well-formed corrections", () => {
    expect(parseRedrive({ corrections: { postalCode: "04229" } })).toEqual({
      corrections: { postalCode: "04229" },
    });
    expect(parseRedrive({})).toEqual({ corrections: {} });
    expect(parseRedrive({ corrections: { postalCode: "4229" } })).toBeUndefined();
    expect(parseRedrive({ corrections: { email: "helga.kraus@example" } })).toBeUndefined();
    expect(parseRedrive({ corrections: { street: "x" } })).toBeUndefined();
  });

  it("lives under /cockpit and keeps the portal navigation for visitors without access", () => {
    expect(zonePath("/api/bulk")).toBe("/cockpit/api/bulk");
    const texts = {
      nav: { home: "S", account: "K", mailbox: "P", contracts: "V", consumption: "B" },
    };
    const items = navigation(texts as never, session("owner"));
    expect(items.find((item) => item.href === "/cockpit")).toMatchObject({ active: true });
    // Without the cockpit role there is no cockpit entry.
    expect(navigation(texts as never, session()).some((item) => item.href === "/cockpit")).toBe(
      false,
    );
    expect(navigation(texts as never)).toHaveLength(1);
  });

  it("gives the owner the mockup's sidebar: Migration and Verwaltung with counts and keys", () => {
    const items = cockpitNavigation(navTexts, "owner", { clarifications: 14, deadLetters: 6 });
    expect(items.map((item) => [item.label, item.href, item.group, item.sub ?? false])).toEqual([
      ["Übersicht", "/cockpit", "Migration", false],
      ["Klärfälle", "/cockpit#klaerfaelle", undefined, true],
      ["DLQ", "/cockpit#dlq", undefined, true],
      ["Ereignisse", "/cockpit#ereignisse", undefined, true],
      ["Demo-Pässe", "/cockpit/paesse", "Verwaltung", false],
      ["Einstellungen", "/cockpit/paesse#einstellungen", undefined, true],
      ["Zum Kundenportal", "/konto", "Kundenportal", false],
    ]);
    expect(items.map((item) => item.icon)).toEqual([
      "gauge",
      "alert",
      "inbox",
      "clock",
      "ticket",
      "settings",
      "home",
    ]);
    expect(items.find((item) => item.label === "Klärfälle")?.count).toBe(14);
    expect(items.find((item) => item.label === "DLQ")?.count).toBe(6);
    expect(items.filter((item) => item.kbd).map((item) => item.kbd)).toEqual(["g c", "g p"]);
    expect(cockpitShortcuts("owner")).toEqual([
      { keys: "g c", href: "/cockpit" },
      { keys: "g p", href: "/cockpit/paesse" },
    ]);
  });

  it("gives pass holders their cockpit and pass status, but no administration", () => {
    const items = cockpitNavigation(navTexts, "pass", {});
    expect(items.some((item) => item.href.startsWith("/cockpit/paesse"))).toBe(false);
    expect(items.some((item) => item.group === "Verwaltung")).toBe(false);
    expect(items.slice(-2)).toMatchObject([
      { href: "/konto", label: "Zum Kundenportal", group: "Kundenportal" },
      { href: "/pass", label: "Demo-Pass" },
    ]);
    expect(cockpitShortcuts("pass")).toEqual([{ keys: "g c", href: "/cockpit" }]);
  });

  it("marks the current page with or without the basePath, never the anchors", () => {
    const items = cockpitNavigation(navTexts, "owner", {});
    const current = (path: string) =>
      markCurrent(items, path)
        .filter((item) => item.active)
        .map((item) => item.label);
    expect(current("/")).toEqual(["Übersicht"]);
    expect(current("/cockpit")).toEqual(["Übersicht"]);
    expect(current("/paesse")).toEqual(["Demo-Pässe"]);
    expect(current("/cockpit/paesse/")).toEqual(["Demo-Pässe"]);
    expect(current("/suche")).toEqual([]);
    expect(markCurrent(items, "/").some((item) => "currentOn" in item)).toBe(false);
  });

  it("has the same texts in both languages", () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, inner]) =>
        typeof inner === "object" ? keys(inner).map((k) => `${key}.${k}`) : [key],
      );
    expect(keys(en).sort()).toEqual(keys(de).sort());
  });
});
