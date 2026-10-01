import { describe, expect, it } from "vitest";
import type { ContractRecord } from "./contract.js";
import { addMonths, earliestTerminationDate, endOfMonth, germanFormat, today } from "./dates.js";
import { earliestEnd } from "./lifecycle.js";

describe("calendar arithmetic", () => {
  it("finds the last day of a month, also in February of leap years", () => {
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2028-02-01")).toBe("2028-02-29");
    expect(endOfMonth("2026-12-31")).toBe("2026-12-31");
    expect(endOfMonth("2026-04-15")).toBe("2026-04-30");
  });

  it("adds months without running over the end of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-04-03", 12)).toBe("2027-04-03");
    expect(addMonths("2026-04-03", 0)).toBe("2026-04-03");
  });

  it("formats dates the German way", () => {
    expect(germanFormat("2026-12-31")).toBe("31.12.2026");
  });
});

describe("today in Germany", () => {
  it.each([
    [
      "shortly after midnight on the day summer time begins",
      "2026-03-28T23:30:00.000Z",
      "2026-03-29",
    ],
    ["shortly before midnight after summer time began", "2026-03-29T21:30:00.000Z", "2026-03-29"],
    [
      "shortly after midnight on the day summer time ends",
      "2026-10-24T22:30:00.000Z",
      "2026-10-25",
    ],
    ["late on the day summer time ended", "2026-10-25T22:30:00.000Z", "2026-10-25"],
    ["at the turn of the year", "2026-12-31T23:00:00.000Z", "2027-01-01"],
  ])("is the German date %s", (_case, instant, date) => {
    expect(today(new Date(instant))).toBe(date);
  });
});

describe("earliest termination date", () => {
  it("is the end of the minimum term while the notice period fits before it", () => {
    expect(earliestTerminationDate("2026-10-02", "2027-04-03", 1)).toBe("2027-04-03");
    // Exactly one month before: still fits.
    expect(earliestTerminationDate("2027-03-03", "2027-04-03", 1)).toBe("2027-04-03");
  });

  it("is the end of the month the notice period ends in, once it no longer fits", () => {
    expect(earliestTerminationDate("2027-03-04", "2027-04-03", 1)).toBe("2027-04-30");
    expect(earliestTerminationDate("2027-03-10", "2027-04-03", 1)).toBe("2027-04-30");
    expect(earliestTerminationDate("2026-10-02", "2025-01-01", 3)).toBe("2027-01-31");
  });

  it("handles the end of January without skipping February", () => {
    expect(earliestTerminationDate("2027-01-31", "2026-12-31", 1)).toBe("2027-02-28");
    expect(earliestTerminationDate("2028-01-31", "2026-12-31", 1)).toBe("2028-02-29");
  });

  it("without notice period is the end of the current month after the minimum term", () => {
    expect(earliestTerminationDate("2026-10-02", "2026-06-30", 0)).toBe("2026-10-31");
    expect(earliestTerminationDate("2026-10-02", "2026-10-02", 0)).toBe("2026-10-02");
  });

  const running = {
    startDate: "2024-01-01",
    minimumTermMonths: 12,
    noticePeriodMonths: 1,
  } as ContractRecord;

  it("counts from the German date: a notice at 00:30 on 1 February is a February notice", () => {
    // 31 January 23:30 UTC is 1 February 00:30 in Germany (winter time).
    expect(earliestEnd(running, new Date("2026-01-31T23:30:00.000Z"))).toBe("2026-03-31");
    expect(earliestEnd(running, new Date("2026-01-31T22:30:00.000Z"))).toBe("2026-02-28");
  });

  it("counts from the German date also in summer time (UTC+2)", () => {
    // 31 March 22:30 UTC is 1 April 00:30 in Germany.
    expect(earliestEnd(running, new Date("2026-03-31T22:30:00.000Z"))).toBe("2026-05-31");
    expect(earliestEnd(running, new Date("2026-03-31T21:30:00.000Z"))).toBe("2026-04-30");
  });
});
