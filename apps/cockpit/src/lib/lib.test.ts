import { describe, expect, it } from "vitest";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import { parseRedrive } from "./redrive";
import { navigation, zonePath } from "./zone";

/** An unsigned access token with the given Cognito groups (the navigation only reads it). */
const session = (...groups: string[]) => ({
  accessToken: `e30.${Buffer.from(JSON.stringify({ "cognito:groups": groups })).toString("base64url")}.x`,
});

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

  it("lives under /cockpit and marks itself in the navigation", () => {
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

  it("has the same texts in both languages", () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, inner]) =>
        typeof inner === "object" ? keys(inner).map((k) => `${key}.${k}`) : [key],
      );
    expect(keys(en).sort()).toEqual(keys(de).sort());
  });
});
