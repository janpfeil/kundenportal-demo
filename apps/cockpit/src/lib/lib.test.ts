import { describe, expect, it } from "vitest";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import { formatDateTime, percent } from "./format";
import { parseRedrive } from "./redrive";
import { navigation, zonePath } from "./zone";

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

  it("computes progress in whole percent and formats times in German time", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, undefined)).toBe(0);
    expect(formatDateTime("2026-09-30T10:00:00.000Z", "de")).toContain("12:00:00");
  });

  it("lives under /cockpit and marks itself in the navigation", () => {
    expect(zonePath("/api/bulk")).toBe("/cockpit/api/bulk");
    const texts = {
      nav: { home: "S", account: "K", mailbox: "P", contracts: "V", consumption: "B" },
    };
    const items = navigation(texts as never, true, de.nav);
    expect(items.find((item) => item.href === "/cockpit")).toMatchObject({ active: true });
    expect(navigation(texts as never, false)).toHaveLength(1);
  });

  it("has the same texts in both languages", () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, inner]) =>
        typeof inner === "object" ? keys(inner).map((k) => `${key}.${k}`) : [key],
      );
    expect(keys(en).sort()).toEqual(keys(de).sort());
  });
});
