import { conflict, unprocessable } from "./clock.js";
import {
  type ContractRecord,
  minimumTermEndOf,
  noticePeriodOf,
  optionOf,
  pendingTermination,
  statusOf,
} from "./contract.js";
import { earliestTerminationDate, germanFormat, today } from "./dates.js";
import { isMetered } from "./divisions.js";
import type { PriceVersion, ProductOption, ProductRecord } from "./products.js";
import { recommendedInstallment } from "./tariffs.js";

/**
 * Rules of a contract's lifecycle (fachkonzept, phase 7) as pure functions: each takes the
 * current contract and returns the next state, or throws a problem (409 for a move the
 * contract's state does not allow, 422 for input the rules reject). Details are German,
 * the portal shows them to the customer.
 */

export function assertRunning(record: ContractRecord, now: Date): void {
  if (statusOf(record, today(now)) === "terminated") {
    throw conflict("Der Vertrag ist beendet und lässt sich nicht mehr ändern.");
  }
}

/** Customers change neither blocked nor ended contracts. */
export function assertCustomerMayChange(record: ContractRecord, now: Date): void {
  if (record.blocked) {
    throw conflict("Der Vertrag ist gesperrt. Änderungen sind nur über den Kundenservice möglich.");
  }
  assertRunning(record, now);
}

/** The earliest end a notice given today reaches. */
export function earliestEnd(record: ContractRecord, now: Date): string {
  return earliestTerminationDate(today(now), minimumTermEndOf(record), noticePeriodOf(record));
}

/**
 * Gives notice. The customer chooses the earliest end or a later one; the operator may
 * end the contract on any day from today on (`allowEarlier`) and replace a pending
 * termination. The contract stays active until the effective date.
 */
export function terminate(
  record: ContractRecord,
  input: {
    effectiveDate?: string | undefined;
    by: "customer" | "operator";
    reason?: string | undefined;
    now: Date;
  },
): ContractRecord {
  const { by, now } = input;
  assertRunning(record, now);
  const pending = pendingTermination(record, today(now));
  if (pending && by === "customer") {
    throw conflict(`Der Vertrag ist bereits zum ${germanFormat(pending.effectiveDate)} gekündigt.`);
  }
  const earliest = earliestEnd(record, now);
  const effectiveDate = input.effectiveDate ?? earliest;
  if (effectiveDate < today(now)) {
    throw unprocessable("Das Vertragsende darf nicht in der Vergangenheit liegen.");
  }
  if (by === "customer" && effectiveDate < earliest) {
    throw unprocessable(
      `Der Vertrag kann frühestens zum ${germanFormat(earliest)} gekündigt werden.`,
    );
  }
  return {
    ...record,
    termination: {
      kind: "termination",
      effectiveDate,
      requestedAt: now.toISOString(),
      by,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  };
}

/**
 * Takes back a pending termination, possible until its effective date. A customer takes
 * back only their own notice; the operator's notice only the operator.
 */
export function cancelTermination(
  record: ContractRecord,
  by: "customer" | "operator",
  now: Date,
): ContractRecord {
  assertRunning(record, now);
  const pending = pendingTermination(record, today(now));
  if (!pending) throw conflict("Der Vertrag ist nicht gekündigt.");
  if (by === "customer" && pending.by === "operator") {
    throw conflict(
      "Diese Kündigung hat der Anbieter erfasst. Bitte wenden Sie sich an den Kundenservice.",
    );
  }
  const { termination: _removed, ...rest } = record;
  return rest;
}

/**
 * Withdrawal (Widerruf) of a contract concluded in the portal, until the last day of the
 * withdrawal period; it ends the contract at once (effective today).
 */
export function withdraw(record: ContractRecord, now: Date): ContractRecord {
  assertRunning(record, now);
  if (!record.orderedAt || !record.withdrawableUntil) {
    throw conflict("Nur im Portal abgeschlossene Verträge lassen sich widerrufen.");
  }
  const day = today(now);
  if (day > record.withdrawableUntil) {
    throw conflict(
      `Die Widerrufsfrist ist am ${germanFormat(record.withdrawableUntil)} abgelaufen.`,
    );
  }
  return {
    ...record,
    status: "terminated",
    termination: {
      kind: "withdrawal",
      effectiveDate: day,
      requestedAt: now.toISOString(),
      by: "customer",
    },
  };
}

/**
 * Another option of the same price version. A metered contract's allowed range moves
 * with the prices and the installment stays inside it; telco follows the option's price.
 */
export function withOption(
  record: ContractRecord,
  version: PriceVersion,
  optionId: string,
): ContractRecord {
  const option = optionOf(version, optionId);
  if (!option) throw unprocessable(`Unknown tariff option ${optionId}`);
  const next: ContractRecord = { ...record, tariffOption: option.optionId };
  if (isMetered(record.division)) {
    const range = recommendedInstallment(record.estimatedAnnualConsumption ?? 0, option);
    next.installmentMinCent = range.minCent;
    next.installmentMaxCent = range.maxCent;
    next.monthlyInstallmentCent = Math.min(
      Math.max(record.monthlyInstallmentCent, range.minCent),
      range.maxCent,
    );
  } else {
    priced(next, option);
  }
  return next;
}

function priced(next: ContractRecord, option: ProductOption): void {
  next.monthlyInstallmentCent = option.monthlyPriceCent;
  if (option.dataVolumeMb) next.dataVolumeMb = option.dataVolumeMb;
}

/**
 * Moves a contract to a product's price version (another product of the division, or a
 * newer version of its own). The installment follows the new prices: metered contracts
 * get the recommended installment for their estimated consumption, telco the option's
 * price. Start, minimum term and its end stay; the notice period becomes the product's.
 */
export function onVersion(
  record: ContractRecord,
  product: ProductRecord,
  version: PriceVersion,
  optionId: string,
): ContractRecord {
  const option = optionOf(version, optionId);
  if (!option) throw unprocessable(`Das Produkt hat keine Option ${optionId}.`);
  const next: ContractRecord = {
    ...record,
    productId: product.productId,
    productVersion: version.version,
    tariffName: product.name,
    tariffOption: option.optionId,
    noticePeriodMonths: product.noticePeriodMonths,
  };
  if (isMetered(record.division)) {
    const range = recommendedInstallment(record.estimatedAnnualConsumption ?? 0, option);
    next.monthlyInstallmentCent = range.installmentCent;
    next.installmentMinCent = range.minCent;
    next.installmentMaxCent = range.maxCent;
  } else {
    priced(next, option);
  }
  return next;
}
