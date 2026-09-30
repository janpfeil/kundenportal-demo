import type { ContractUpdate } from "@kundenportal/api-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Contract ids are UUIDs; anything else never reaches the API. */
export function isContractId(value: string): boolean {
  return UUID.test(value);
}

export type InstallmentCheck =
  { ok: true; cents: number } | { ok: false; reason: "empty" | "whole" | "range" };

/**
 * Reads the installment the customer typed (euros; comma or point as decimal separator)
 * and checks it against the contract's range: whole euros between min and max.
 */
export function parseInstallmentEuros(
  input: string,
  minCent: number | undefined,
  maxCent: number | undefined,
): InstallmentCheck {
  const text = input.trim().replace(",", ".");
  if (text === "") return { ok: false, reason: "empty" };
  const euros = Number(text);
  if (!Number.isFinite(euros) || !Number.isInteger(euros) || euros < 1)
    return { ok: false, reason: "whole" };
  const cents = euros * 100;
  if ((minCent !== undefined && cents < minCent) || (maxCent !== undefined && cents > maxCent))
    return { ok: false, reason: "range" };
  return { ok: true, cents };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validates the body the browser sends to the zone's PATCH route; `undefined` if invalid. */
export function parseContractUpdate(body: unknown): ContractUpdate | undefined {
  if (!isRecord(body)) return undefined;
  const keys = Object.keys(body);
  if (
    keys.length === 0 ||
    keys.some((key) => key !== "monthlyInstallmentCent" && key !== "tariffOption")
  )
    return undefined;
  const update: ContractUpdate = {};
  const { monthlyInstallmentCent: cents, tariffOption: option } = body;
  if (cents !== undefined) {
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 1) return undefined;
    update.monthlyInstallmentCent = cents;
  }
  if (option !== undefined) {
    if (typeof option !== "string" || option.length < 1 || option.length > 40) return undefined;
    update.tariffOption = option;
  }
  return update;
}

export type ContractProblem =
  "session" | "conflict" | "range" | "whole" | "fixed" | "option" | "generic";

/**
 * Maps an error answer of `PATCH /contracts/{id}` to a message key. The API's details are
 * English sentences; the known ones get a translated message, the rest a generic one.
 */
export function contractProblem(status: number, detail: string | undefined): ContractProblem {
  if (status === 401) return "session";
  if (status === 409) return "conflict";
  if (status === 422 && detail) {
    if (/between/i.test(detail)) return "range";
    if (/whole euros/i.test(detail)) return "whole";
    if (/fixed/i.test(detail)) return "fixed";
    if (/tariff option/i.test(detail)) return "option";
  }
  return "generic";
}
