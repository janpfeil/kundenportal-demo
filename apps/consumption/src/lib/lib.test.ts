import { commonTexts } from "@kundenportal/ui/i18n";
import { describe, expect, it } from "vitest";
import { checkReading, parseNewReading, readingProblem, todayInGermany } from "./reading";
import { BASE_PATH, navigation, zonePath } from "./zone";

/** An unsigned access token with the given Cognito groups (the navigation only reads it). */
const session = (...groups: string[]) => ({
  accessToken: `e30.${Buffer.from(JSON.stringify({ "cognito:groups": groups })).toString("base64url")}.x`,
});

describe("todayInGermany", () => {
  it("uses German time, not UTC", () => {
    expect(todayInGermany(new Date("2026-09-30T21:30:00.000Z"))).toBe("2026-09-30");
    expect(todayInGermany(new Date("2026-09-30T22:30:00.000Z"))).toBe("2026-10-01");
    expect(todayInGermany(new Date("2026-12-31T23:30:00.000Z"))).toBe("2027-01-01");
  });
});

describe("checkReading", () => {
  const today = "2026-09-30";
  const latest = { value: 2000, readAt: "2026-06-01" };

  it("accepts a plausible reading (comma or point as decimal separator)", () => {
    expect(checkReading("2100,5", today, today, latest)).toEqual({
      ok: true,
      reading: { value: 2100.5, readAt: today },
    });
    expect(checkReading(" 0 ", "2026-01-01", today)).toEqual({
      ok: true,
      reading: { value: 0, readAt: "2026-01-01" },
    });
  });

  it.each([
    ["", today, "value", "valueEmpty"],
    ["abc", today, "value", "valueInvalid"],
    ["-1", today, "value", "valueInvalid"],
    ["2000000000", today, "value", "valueInvalid"],
    ["2100", "", "readAt", "dateEmpty"],
    ["2100", "2026-13-01", "readAt", "dateEmpty"],
    ["2100", "2026-10-01", "readAt", "dateFuture"],
    ["2100", "2026-05-31", "readAt", "dateBefore"],
    ["1999", today, "value", "valueBelow"],
  ])("rejects value %j on %j (%s: %s)", (value, readAt, field, reason) => {
    expect(checkReading(value, readAt, today, latest)).toEqual({ ok: false, field, reason });
  });
});

describe("parseNewReading", () => {
  it("accepts exactly value and date", () => {
    expect(parseNewReading({ value: 12.5, readAt: "2026-09-30" })).toEqual({
      value: 12.5,
      readAt: "2026-09-30",
    });
    for (const body of [
      null,
      "x",
      { value: 1 },
      { value: Number.NaN, readAt: "2026-09-30" },
      { value: 1, readAt: "30.09.2026" },
      { value: 1, readAt: "2026-09-30", contractId: "x" },
    ])
      expect(parseNewReading(body)).toBeUndefined();
  });
});

describe("readingProblem", () => {
  it("translates the API's plausibility details", () => {
    expect(readingProblem(422, "The date is before the latest reading of 2026-06-01")).toEqual({
      kind: "dateBefore",
      date: "2026-06-01",
    });
    expect(readingProblem(422, "The value is below the latest reading of 2000.5")).toEqual({
      kind: "valueBelow",
      value: 2000.5,
    });
    expect(readingProblem(422, "The date is in the future")).toEqual({ kind: "future" });
    expect(readingProblem(422, "The contract has no meter")).toEqual({ kind: "noMeter" });
    expect(readingProblem(422, "The contract is not active")).toEqual({ kind: "inactive" });
    expect(readingProblem(422, "Something else")).toEqual({ kind: "implausible" });
    expect(readingProblem(401, undefined)).toEqual({ kind: "session" });
    expect(readingProblem(500, undefined)).toEqual({ kind: "generic" });
  });
});

describe("zone", () => {
  it("lives below /verbrauch and marks its navigation entry active", () => {
    expect(BASE_PATH).toBe("/verbrauch");
    expect(zonePath("/api/contracts/x/readings")).toBe("/verbrauch/api/contracts/x/readings");
    const active = navigation(commonTexts.de, session()).filter((item) => item.active);
    expect(active).toEqual([
      { href: "/verbrauch", label: "Verbrauch", icon: "chart", active: true },
    ]);
  });
});
