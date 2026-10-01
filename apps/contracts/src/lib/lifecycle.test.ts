import { describe, expect, it } from "vitest";
import { addDays, dayKey, isIsoDate } from "./dates";
import {
  canWithdraw,
  checkTerminationDate,
  contractState,
  earliestTermination,
  lifecycleProblem,
  noticeMonths,
  parseEmptyBody,
  parseTerminationRequest,
  terminationRule,
} from "./lifecycle";

const requestedAt = "2026-10-01T09:00:00.000Z";

describe("dates", () => {
  it("takes today's date in German time, also shortly after midnight there", () => {
    expect(dayKey(new Date("2026-10-01T22:30:00.000Z"))).toBe("2026-10-02");
    expect(dayKey(new Date("2026-10-01T21:30:00.000Z"))).toBe("2026-10-01");
  });

  it("accepts real calendar days only", () => {
    expect(isIsoDate("2027-03-31")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2027-04-31")).toBe(false);
    expect(isIsoDate("31.03.2027")).toBe(false);
    expect(isIsoDate(20270331)).toBe(false);
  });

  it("adds days across months, years and the DST change", () => {
    expect(addDays("2026-10-02", 90)).toBe("2026-12-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("contractState", () => {
  it("is active without a termination", () => {
    expect(contractState({ status: "active" })).toEqual({ kind: "active" });
  });

  it("is noticed while a termination is pending (the contract still runs)", () => {
    expect(
      contractState({
        status: "active",
        termination: {
          kind: "termination",
          effectiveDate: "2027-03-31",
          requestedAt,
          by: "customer",
        },
      }),
    ).toEqual({ kind: "noticed", effectiveDate: "2027-03-31" });
  });

  it("tells an ended contract from a withdrawn one", () => {
    expect(
      contractState({
        status: "terminated",
        termination: {
          kind: "withdrawal",
          effectiveDate: "2026-10-02",
          requestedAt,
          by: "customer",
        },
      }),
    ).toEqual({ kind: "withdrawn", effectiveDate: "2026-10-02" });
    expect(
      contractState({
        status: "terminated",
        termination: {
          kind: "termination",
          effectiveDate: "2026-09-30",
          requestedAt,
          by: "operator",
        },
      }),
    ).toEqual({ kind: "ended", effectiveDate: "2026-09-30" });
    // Contracts ended before phase 7 carry no termination.
    expect(contractState({ status: "terminated" })).toEqual({ kind: "ended" });
  });
});

describe("termination rules", () => {
  it("shows the API's earliest date, the end of the minimum term as fallback", () => {
    expect(
      earliestTermination({
        minimumTermEndDate: "2027-03-31",
        earliestTerminationDate: "2027-03-31",
      }),
    ).toBe("2027-03-31");
    expect(earliestTermination({ minimumTermEndDate: "2027-03-31" })).toBe("2027-03-31");
  });

  it("names the rule that sets the earliest date", () => {
    expect(
      terminationRule({ minimumTermEndDate: "2027-03-31", earliestTerminationDate: "2027-03-31" }),
    ).toBe("term");
    // Past the minimum term: notice period to the end of a month.
    expect(
      terminationRule({ minimumTermEndDate: "2025-12-31", earliestTerminationDate: "2026-11-30" }),
    ).toBe("notice");
  });

  it("assumes one month of notice unless the product says otherwise", () => {
    expect(noticeMonths({})).toBe(1);
    expect(noticeMonths({ noticePeriodMonths: 3 })).toBe(3);
    expect(noticeMonths({ noticePeriodMonths: 0 })).toBe(0);
  });

  it("accepts the earliest date and later ones, nothing before", () => {
    expect(checkTerminationDate("2027-03-31", "2027-03-31")).toEqual({
      ok: true,
      date: "2027-03-31",
    });
    expect(checkTerminationDate(" 2027-06-30 ", "2027-03-31")).toEqual({
      ok: true,
      date: "2027-06-30",
    });
    expect(checkTerminationDate("2027-03-30", "2027-03-31")).toEqual({
      ok: false,
      reason: "early",
    });
    expect(checkTerminationDate("", "2027-03-31")).toEqual({ ok: false, reason: "empty" });
    expect(checkTerminationDate("2027-02-30", "2027-01-31")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("canWithdraw", () => {
  const contract = { status: "active" as const, withdrawableUntil: "2026-10-15" };

  it("allows a withdrawal until and including the last day", () => {
    expect(canWithdraw(contract, "2026-10-02")).toBe(true);
    expect(canWithdraw(contract, "2026-10-15")).toBe(true);
    expect(canWithdraw(contract, "2026-10-16")).toBe(false);
  });

  it("not for contracts without a withdrawal period (taken over) or already ended", () => {
    expect(canWithdraw({ status: "active" }, "2026-10-02")).toBe(false);
    expect(canWithdraw({ ...contract, status: "terminated" }, "2026-10-02")).toBe(false);
  });
});

describe("bodies of the lifecycle routes", () => {
  it("takes an optional effective date for a termination", () => {
    expect(parseTerminationRequest({})).toEqual({});
    expect(parseTerminationRequest({ effectiveDate: "2027-03-31" })).toEqual({
      effectiveDate: "2027-03-31",
    });
    expect(parseTerminationRequest({ effectiveDate: "31.03.2027" })).toBeUndefined();
    expect(parseTerminationRequest({ effectiveDate: "2027-03-31", reason: "x" })).toBeUndefined();
    expect(parseTerminationRequest([])).toBeUndefined();
  });

  it("takes nothing else than an empty object for withdrawal and taking back", () => {
    expect(parseEmptyBody({})).toEqual({});
    expect(parseEmptyBody({ force: true })).toBeUndefined();
    expect(parseEmptyBody(null)).toBeUndefined();
  });
});

describe("lifecycleProblem", () => {
  it("maps the API's answers to messages", () => {
    expect(lifecycleProblem(401, undefined)).toBe("session");
    expect(lifecycleProblem(409, "The contract is blocked by the operator")).toBe("blocked");
    expect(lifecycleProblem(409, "The contract has already ended")).toBe("conflict");
    expect(lifecycleProblem(422, "effectiveDate before earliestTerminationDate")).toBe("date");
    expect(lifecycleProblem(500, undefined)).toBe("generic");
  });
});
