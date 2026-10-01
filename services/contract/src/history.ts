import { ContractChangeField, type ContractInitiator } from "@kundenportal/events";
import { type ContractRecord, optionOf, productIdOf, productVersionOf } from "./contract.js";
import { germanFormat } from "./dates.js";
import { isMetered } from "./divisions.js";
import type { PriceVersion } from "./products.js";

/** Kinds of history entries; mirrors `ContractHistoryEntry.change`. */
export type HistoryChange = ContractChangeField | "created" | "taken-over";

/** One entry of a contract's history (mirrors `ContractHistoryEntry`). */
export interface HistoryEntry {
  at: string;
  change: HistoryChange;
  by: ContractInitiator;
  reason?: string;
  summary?: string;
}

/** `87 €`, `19,99 €`. */
export function euros(cents: number): string {
  return cents % 100 === 0 ? `${cents / 100} €` : `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

/**
 * What changed between two states of a contract, in the order of `ContractChangeField`:
 * the installment, the option, the product or its price version, and the lifecycle
 * (termination, its cancellation, withdrawal, block).
 */
export function changedFields(
  current: ContractRecord,
  next: ContractRecord,
): ContractChangeField[] {
  const changed = new Set<ContractChangeField>();
  if (next.monthlyInstallmentCent !== current.monthlyInstallmentCent) changed.add("installment");
  if (next.tariffOption !== current.tariffOption) changed.add("tariffOption");
  if (productIdOf(next) !== productIdOf(current)) changed.add("product");
  else if (productVersionOf(next) !== productVersionOf(current)) changed.add("priceVersion");
  const before = current.termination;
  const after = next.termination;
  if (after && (after.kind !== before?.kind || after.effectiveDate !== before.effectiveDate)) {
    changed.add(after.kind === "withdrawal" ? "withdrawal" : "termination");
  }
  if (before && !after) changed.add("terminationCancelled");
  if (Boolean(next.blocked) !== Boolean(current.blocked)) {
    changed.add(next.blocked ? "blocked" : "unblocked");
  }
  return ContractChangeField.options.filter((field) => changed.has(field));
}

/** The change a history entry is filed under when one action changed several things. */
const PRIMARY: readonly ContractChangeField[] = [
  "withdrawal",
  "termination",
  "terminationCancelled",
  "blocked",
  "unblocked",
  "product",
  "priceVersion",
  "tariffOption",
  "installment",
];

const label = (version: PriceVersion | undefined, optionId: string) =>
  (version && optionOf(version, optionId)?.label) ?? optionId;

/**
 * The history entry of a change, with a German summary such as
 * `Option Standard → Ökostrom · Abschlag 87 € → 90 €`.
 */
export function historyEntry(input: {
  current: ContractRecord;
  next: ContractRecord;
  changes: ContractChangeField[];
  by: ContractInitiator;
  reason?: string | undefined;
  versions?: { before?: PriceVersion | undefined; after?: PriceVersion | undefined };
}): HistoryEntry {
  const { current, next, changes, by, reason, versions = {} } = input;
  const parts: string[] = [];
  for (const change of changes) {
    switch (change) {
      case "product":
        parts.push(`Produkt ${current.tariffName} → ${next.tariffName}`);
        break;
      case "priceVersion":
        parts.push(`Preisversion ${productVersionOf(current)} → ${productVersionOf(next)}`);
        break;
      case "tariffOption":
        parts.push(
          `Option ${label(versions.before, current.tariffOption)} → ${label(versions.after, next.tariffOption)}`,
        );
        break;
      case "installment":
        parts.push(
          `${isMetered(next.division) ? "Abschlag" : "Monatspreis"} ${euros(current.monthlyInstallmentCent)} → ${euros(next.monthlyInstallmentCent)}`,
        );
        break;
      case "termination":
        parts.push(
          current.termination && current.termination.kind === "termination"
            ? `Kündigung zum ${germanFormat(next.termination?.effectiveDate ?? "")} (statt zum ${germanFormat(current.termination.effectiveDate)})`
            : `Kündigung zum ${germanFormat(next.termination?.effectiveDate ?? "")}`,
        );
        break;
      case "terminationCancelled":
        parts.push(
          `Kündigung zum ${germanFormat(current.termination?.effectiveDate ?? "")} zurückgenommen`,
        );
        break;
      case "withdrawal":
        parts.push(
          `Widerruf, Vertrag endet am ${germanFormat(next.termination?.effectiveDate ?? "")}`,
        );
        break;
      case "blocked":
        parts.push("Vertrag gesperrt");
        break;
      case "unblocked":
        parts.push("Vertrag entsperrt");
        break;
    }
  }
  const change = PRIMARY.find((field) => changes.includes(field)) ?? "installment";
  return {
    at: next.updatedAt,
    change,
    by,
    ...(reason ? { reason } : {}),
    ...(parts.length > 0 ? { summary: parts.join(" · ") } : {}),
  };
}

/**
 * The first entry of every history, derived from the contract itself (no item of its
 * own): concluded in the portal by the customer, taken over from a legacy system, or a
 * demo contract of the system. The summary names only what never changes afterwards.
 */
export function creationEntry(record: ContractRecord): HistoryEntry {
  if (record.legacyContractId) {
    return {
      at: record.createdAt,
      change: "taken-over",
      by: "system",
      summary: `Übernommen aus Altvertrag ${record.legacyContractId}`,
    };
  }
  return {
    at: record.orderedAt ?? record.createdAt,
    change: "created",
    by: record.orderedAt ? "customer" : "system",
    summary: `${record.orderedAt ? "Abschluss im Portal" : "Demo-Vertrag"}, Beginn ${germanFormat(record.startDate)}`,
  };
}
