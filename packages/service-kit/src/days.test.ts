import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  dayAttribute,
  germanDate,
  germanDayStart,
  lastGermanDays,
} from "./days.js";

describe("German calendar days", () => {
  it("dates an instant by the German day, not the UTC day", () => {
    // 23:30 UTC on 30 September is already 01:30 on 1 October in summer time.
    expect(germanDate(new Date("2026-09-30T23:30:00.000Z"))).toBe("2026-10-01");
    expect(germanDate(new Date("2026-09-30T21:59:59.999Z"))).toBe("2026-09-30");
    expect(germanDate(new Date("2026-09-30T22:00:00.000Z"))).toBe("2026-10-01");
    // Winter time: one hour ahead.
    expect(germanDate(new Date("2026-12-31T22:59:59.000Z"))).toBe("2026-12-31");
    expect(germanDate(new Date("2026-12-31T23:00:00.000Z"))).toBe("2027-01-01");
  });

  it("starts a day at 00:00 German time in summer and in winter", () => {
    expect(germanDayStart("2026-10-01").toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(germanDayStart("2026-12-24").toISOString()).toBe("2026-12-23T23:00:00.000Z");
  });

  it("gives the days of the clock changes 23 and 25 hours", () => {
    // 29 March 2026: 02:00 CET becomes 03:00 CEST.
    const spring = germanDayStart("2026-03-29");
    const afterSpring = germanDayStart("2026-03-30");
    expect(spring.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(afterSpring.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(afterSpring.getTime() - spring.getTime()).toBe(23 * 3_600_000);
    // 25 October 2026: 03:00 CEST becomes 02:00 CET.
    const autumn = germanDayStart("2026-10-25");
    const afterAutumn = germanDayStart("2026-10-26");
    expect(autumn.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(afterAutumn.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(afterAutumn.getTime() - autumn.getTime()).toBe(25 * 3_600_000);
    expect(germanDate(new Date("2026-10-25T22:30:00.000Z"))).toBe("2026-10-25");
  });

  it("counts calendar days across months, years and leap days", () => {
    expect(addCalendarDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addCalendarDays("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("lists the last seven German days, oldest first and today last", () => {
    expect(lastGermanDays(new Date("2026-09-30T22:30:00.000Z"))).toEqual([
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
    expect(lastGermanDays(new Date("2026-03-30T10:00:00.000Z"), 3)).toEqual([
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
    ]);
  });

  it("names the day counter attribute after the German date", () => {
    expect(dayAttribute("2026-10-01")).toBe("d20261001");
    expect(() => dayAttribute("1.10.2026")).toThrow();
  });
});
