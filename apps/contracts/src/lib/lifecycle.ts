/*
 * The contract's lifecycle as the customer sees it: running, notice given ("gekündigt zum
 * …"), ended or withdrawn, and blocked by the operator. Rules (owner, phase 7): notice to
 * the end of the minimum term, afterwards with the notice period to the end of a month;
 * the contract runs until the effective date and the notice can be taken back until then;
 * a withdrawal within 14 days after ordering in the portal ends it at once.
 */
import type { Contract } from "@kundenportal/api-contract";
import { isIsoDate } from "./dates";

export type ContractState =
  | { kind: "active" }
  | { kind: "noticed"; effectiveDate: string }
  | { kind: "ended"; effectiveDate?: string }
  | { kind: "withdrawn"; effectiveDate?: string };

type Lifecycle = Pick<Contract, "status"> & Partial<Pick<Contract, "termination">>;

export function contractState(contract: Lifecycle): ContractState {
  const { termination } = contract;
  if (contract.status === "terminated") {
    const date = termination ? { effectiveDate: termination.effectiveDate } : {};
    return termination?.kind === "withdrawal"
      ? { kind: "withdrawn", ...date }
      : { kind: "ended", ...date };
  }
  if (termination?.kind === "termination")
    return { kind: "noticed", effectiveDate: termination.effectiveDate };
  return { kind: "active" };
}

/** The earliest end a notice given today reaches; the end of the minimum term as fallback. */
export function earliestTermination(
  contract: Pick<Contract, "minimumTermEndDate" | "earliestTerminationDate">,
): string {
  return contract.earliestTerminationDate ?? contract.minimumTermEndDate;
}

/** The notice period in months; one month unless the product says otherwise. */
export function noticeMonths(contract: Pick<Contract, "noticePeriodMonths">): number {
  return contract.noticePeriodMonths ?? 1;
}

/**
 * Which rule sets the earliest date: the end of the minimum term, or (once that is too
 * close or past) the notice period to the end of a month.
 */
export function terminationRule(
  contract: Pick<Contract, "minimumTermEndDate" | "earliestTerminationDate">,
): "term" | "notice" {
  return earliestTermination(contract) <= contract.minimumTermEndDate ? "term" : "notice";
}

/** The customer may withdraw: a running contract concluded in the portal, until the last day. */
export function canWithdraw(
  contract: Lifecycle & Pick<Contract, "withdrawableUntil" | "blocked">,
  today: string,
): boolean {
  return (
    contract.status === "active" &&
    contract.withdrawableUntil !== undefined &&
    contract.withdrawableUntil >= today
  );
}

export type TerminationDateCheck =
  { ok: true; date: string } | { ok: false; reason: "empty" | "invalid" | "early" };

/** Checks the wished end of the contract: a real date, not before the earliest one. */
export function checkTerminationDate(input: string, earliest: string): TerminationDateCheck {
  const date = input.trim();
  if (date === "") return { ok: false, reason: "empty" };
  if (!isIsoDate(date)) return { ok: false, reason: "invalid" };
  if (date < earliest) return { ok: false, reason: "early" };
  return { ok: true, date };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The body of `POST …/termination`: nothing (the earliest date) or `{ effectiveDate }`. */
export function parseTerminationRequest(body: unknown): { effectiveDate?: string } | undefined {
  if (!isRecord(body)) return undefined;
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "effectiveDate")) return undefined;
  if (body.effectiveDate === undefined) return {};
  return isIsoDate(body.effectiveDate) ? { effectiveDate: body.effectiveDate } : undefined;
}

/** Bodies of the calls without payload (withdrawal, taking a notice back): an empty object. */
export function parseEmptyBody(body: unknown): Record<string, never> | undefined {
  return isRecord(body) && Object.keys(body).length === 0 ? {} : undefined;
}

export type LifecycleProblem = "session" | "blocked" | "conflict" | "date" | "generic";

/**
 * Maps an error answer of the termination and withdrawal calls to a message key. 409 is a
 * blocked contract when the API says so, else a state that changed meanwhile (already
 * ended, period over); 422 a date the rules do not allow.
 */
export function lifecycleProblem(status: number, detail: string | undefined): LifecycleProblem {
  if (status === 401) return "session";
  if (status === 409) return detail && /block/i.test(detail) ? "blocked" : "conflict";
  if (status === 422 || status === 400) return "date";
  return "generic";
}
