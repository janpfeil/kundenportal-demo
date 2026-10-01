import { describe, expect, it } from "vitest";
import { publicTexts } from "@/i18n/public";
import { parseOffer } from "./offer";
import { cookieValue, isUiHint } from "./ui-hint";

const offer = {
  passHours: 7,
  quotas: { api: 5000, events: 1000, uploads: 20 },
  uploadMaxBytes: 5242880,
  redemptionOpen: true,
};

describe("parseOffer", () => {
  it("accepts the contract's shape and drops unknown fields", () => {
    expect(parseOffer({ ...offer, extra: 1 })).toEqual(offer);
  });

  it("rejects anything else", () => {
    for (const body of [
      null,
      "x",
      { ...offer, passHours: -1 },
      { ...offer, passHours: 1.5 },
      { ...offer, quotas: null },
      { ...offer, quotas: { api: 1, events: 1 } },
      { ...offer, redemptionOpen: "yes" },
      { ...offer, uploadMaxBytes: "5 MB" },
    ])
      expect(parseOffer(body)).toBeUndefined();
  });
});

describe("signed-in hint", () => {
  it("reads single cookies from document.cookie", () => {
    expect(cookieValue("kp_locale=en; kp_ui=pass", "kp_ui")).toBe("pass");
    expect(cookieValue("kp_ui=user", "kp_locale")).toBeUndefined();
    expect(cookieValue("a=%E0%A4%A", "a")).toBeUndefined();
    expect(isUiHint("pass") && isUiHint("user") && isUiHint("owner") && !isUiHint("admin")).toBe(
      true,
    );
  });
});

describe("public texts", () => {
  it("have the same keys in both languages", () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, inner]) =>
        typeof inner === "object" ? keys(inner).map((k) => `${key}.${k}`) : [key],
      );
    expect(keys(publicTexts.en).sort()).toEqual(keys(publicTexts.de).sort());
  });
});
