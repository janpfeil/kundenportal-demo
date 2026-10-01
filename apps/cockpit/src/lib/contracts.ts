/*
 * Contracts as the operator sees and controls them: the state shown as badge, the actions a
 * contract allows (POST /admin/contracts/{id}/actions), their validation (in the form and
 * again in the zone's route handler) and the history as timeline. Free of server APIs.
 */

import type { components } from "@kundenportal/api-contract";
import type { IconName, StatusTone } from "@kundenportal/ui";
import { isDate } from "./filters";

export type OperatorContract = components["schemas"]["OperatorContract"];
export type ContractSummary = components["schemas"]["ContractSummary"];
export type ContractAction = components["schemas"]["ContractAction"];
export type ActionType = ContractAction["type"];
export type HistoryEntry = components["schemas"]["ContractHistoryEntry"];
export type HistoryChange = HistoryEntry["change"];
export type Product = components["schemas"]["Product"];

/** Names of the products and their options, for lists that only carry the ids. */
export interface CatalogEntry {
  name: string;
  options: ReadonlyMap<string, string>;
}
export type Catalog = ReadonlyMap<string, CatalogEntry>;

export function catalogOf(products: readonly Product[] | undefined): Catalog {
  return new Map(
    (products ?? []).map((product) => [
      product.productId,
      {
        name: product.name,
        options: new Map(product.options.map((option) => [option.optionId, option.label])),
      },
    ]),
  );
}

/** The label of an option, e.g. "oeko" → "Öko"; the id when the catalogue does not know it. */
export function optionLabel(catalog: Catalog, productId: string | undefined, optionId: string) {
  return (productId && catalog.get(productId)?.options.get(optionId)) || optionId;
}

/** What the lists and badges call a contract's state. */
export type ContractState = "active" | "pending-termination" | "terminated" | "blocked";

type StateSource = Pick<ContractSummary, "status" | "termination" | "blocked">;

/** Blocked wins (it stops every change), then ended, then a notice that is still pending. */
export function contractState(contract: StateSource): ContractState {
  if (contract.blocked) return "blocked";
  if (contract.status === "terminated") return "terminated";
  if (contract.termination) return "pending-termination";
  return "active";
}

export const STATE_TONES: Record<ContractState, StatusTone> = {
  active: "ok",
  "pending-termination": "warn",
  terminated: "neutral",
  blocked: "err",
};

/** The end the list shows: the date a termination takes effect, else the minimum term's end. */
export function contractEnd(contract: Pick<ContractSummary, "termination" | "minimumTermEndDate">) {
  return contract.termination
    ? { kind: "termination" as const, date: contract.termination.effectiveDate }
    : { kind: "term" as const, date: contract.minimumTermEndDate };
}

export const REASON_MIN = 3;
export const REASON_MAX = 300;

/** Why a reason is not acceptable, if it is not: too short or too long. */
export function reasonProblem(reason: string): "short" | "long" | undefined {
  const length = reason.trim().length;
  if (length < REASON_MIN) return "short";
  if (length > REASON_MAX) return "long";
  return undefined;
}

/** The order of the action forms on the contract page. */
export const ACTION_TYPES = [
  "changeOption",
  "changeProduct",
  "applyPriceVersion",
  "setInstallment",
  "terminate",
  "cancelTermination",
  "block",
  "unblock",
] as const satisfies readonly ActionType[];

/** Actions that ask for a second click before they are sent. */
export const CONFIRMED: ReadonlySet<ActionType> = new Set(["terminate", "block"]);

/** The option ids the contract may switch to (other than its current one). */
export function otherOptions(contract: OperatorContract, product?: Product): string[] {
  const ids = product ? product.options.map((option) => option.optionId) : contract.tariffOptions;
  return ids.filter((id) => id !== contract.tariffOption);
}

/** Orderable products of the contract's division other than its own. */
export function otherProducts(contract: OperatorContract, products: readonly Product[]): Product[] {
  return products.filter(
    (product) =>
      product.division === contract.division &&
      product.status === "active" &&
      product.productId !== contract.productId,
  );
}

/** True when the product has a price version newer than the one the contract uses. */
export function newerVersion(contract: OperatorContract, product?: Product): boolean {
  return (
    product !== undefined &&
    contract.productVersion !== undefined &&
    product.version > contract.productVersion
  );
}

/**
 * The actions this contract allows now. An ended contract allows none but lifting a block;
 * a blocked one only unblocking and, if a notice is pending, taking it back.
 */
export function availableActions(
  contract: OperatorContract,
  product: Product | undefined,
  products: readonly Product[],
): ActionType[] {
  const state = contractState(contract);
  if (contract.status === "terminated") return contract.blocked ? ["unblock"] : [];
  const pending = contract.termination?.kind === "termination";
  if (state === "blocked") return pending ? ["cancelTermination", "unblock"] : ["unblock"];
  const actions: ActionType[] = [];
  if (otherOptions(contract, product).length > 0) actions.push("changeOption");
  if (otherProducts(contract, products).length > 0) actions.push("changeProduct");
  if (newerVersion(contract, product)) actions.push("applyPriceVersion");
  if (contract.unit !== undefined || contract.installmentAdjustable) actions.push("setInstallment");
  actions.push(pending ? "cancelTermination" : "terminate");
  actions.push("block");
  return ACTION_TYPES.filter((type) => actions.includes(type));
}

const OPTION_ID = /^[A-Za-z0-9_-]{1,40}$/;
const PRODUCT_ID = /^[a-z0-9-]{2,40}$/;

/**
 * Validates an action from the browser before the zone forwards it; undefined if it is not
 * one the contract (openapi.yaml, ContractAction) allows. Only the fields of its type pass.
 */
export function parseContractAction(body: unknown, today?: string): ContractAction | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const raw = body as Record<string, unknown>;
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (reasonProblem(reason)) return undefined;
  switch (raw.type) {
    case "changeOption":
      return typeof raw.optionId === "string" && OPTION_ID.test(raw.optionId)
        ? { type: raw.type, optionId: raw.optionId, reason }
        : undefined;
    case "changeProduct":
      return typeof raw.productId === "string" &&
        PRODUCT_ID.test(raw.productId) &&
        typeof raw.optionId === "string" &&
        OPTION_ID.test(raw.optionId)
        ? { type: raw.type, productId: raw.productId, optionId: raw.optionId, reason }
        : undefined;
    case "setInstallment": {
      const cents = raw.monthlyInstallmentCent;
      return typeof cents === "number" && Number.isInteger(cents) && cents >= 100 && cents <= 1e7
        ? { type: raw.type, monthlyInstallmentCent: cents, reason }
        : undefined;
    }
    case "terminate": {
      const date = raw.effectiveDate;
      if (date === undefined || date === "") return { type: raw.type, reason };
      if (typeof date !== "string" || !isDate(date)) return undefined;
      if (today !== undefined && date < today) return undefined;
      return { type: raw.type, effectiveDate: date, reason };
    }
    case "applyPriceVersion":
      return { type: raw.type, reason };
    case "cancelTermination":
    case "block":
    case "unblock":
      return { type: raw.type, reason };
    default:
      return undefined;
  }
}

/** Icon and colour of a history entry in the timeline. */
export const HISTORY_LOOKS: Record<
  HistoryChange,
  { icon: IconName; tone: "ok" | "warn" | "err" | "neutral" }
> = {
  created: { icon: "plus", tone: "ok" },
  installment: { icon: "file", tone: "neutral" },
  tariffOption: { icon: "refresh", tone: "neutral" },
  product: { icon: "refresh", tone: "neutral" },
  priceVersion: { icon: "chart", tone: "neutral" },
  termination: { icon: "logout", tone: "warn" },
  terminationCancelled: { icon: "check", tone: "ok" },
  withdrawal: { icon: "x", tone: "warn" },
  blocked: { icon: "shield", tone: "err" },
  unblocked: { icon: "check", tone: "ok" },
  "taken-over": { icon: "upload", tone: "neutral" },
};
