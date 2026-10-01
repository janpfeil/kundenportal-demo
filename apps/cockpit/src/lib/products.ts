/*
 * The product catalogue as the operator manages it: status badges and the moves between
 * them, running contracts per product and price version, and the validation of the forms
 * "Produkt anlegen", "Bearbeiten" and "Neue Preisversion" — once on the strings of the form
 * (with an error per field) and once on the JSON the zone's route handlers forward.
 */

import type { components } from "@kundenportal/api-contract";
import type { StatusTone } from "@kundenportal/ui";
import {
  DIVISIONS,
  type Division,
  METERED,
  PRODUCT_STATUSES,
  type ProductStatus,
  isDate,
} from "./filters";
import { parseCent, parseEuro } from "./money";

export type Product = components["schemas"]["Product"];
export type ProductOption = components["schemas"]["ProductOption"];
export type PriceVersion = components["schemas"]["PriceVersion"];
export type ProductInput = components["schemas"]["ProductInput"];
export type ProductUpdate = components["schemas"]["ProductUpdate"];
export type PriceVersionInput = components["schemas"]["PriceVersionInput"];

export const PRODUCT_TONES: Record<ProductStatus, StatusTone> = {
  draft: "info",
  active: "ok",
  retiring: "warn",
  archived: "neutral",
};

/** Running contracts of the product, all price versions together. */
export function runningContracts(product: Pick<Product, "contractCount">): number {
  return Object.values(product.contractCount ?? {}).reduce((sum, count) => sum + count, 0);
}

/** Running contracts on one price version. */
export function contractsOn(product: Pick<Product, "contractCount">, version: number): number {
  return product.contractCount?.[String(version)] ?? 0;
}

export type StatusAction = "publish" | "retire" | "reactivate" | "archive";

export const STATUS_TARGETS: Record<StatusAction, ProductStatus> = {
  publish: "active",
  retire: "retiring",
  reactivate: "active",
  archive: "archived",
};

export interface StatusMove {
  action: StatusAction;
  /** Why the move is not possible now: the product still has running contracts. */
  blocked?: "contracts" | undefined;
}

/**
 * The moves of the status a product allows: a draft is published (or archived unused), an
 * active product retires (no new orders, running contracts stay), a retiring one becomes
 * orderable again or is archived once no contract runs on it.
 */
export function statusMoves(product: Pick<Product, "status" | "contractCount">): StatusMove[] {
  const running = runningContracts(product);
  const archive: StatusMove =
    running > 0 ? { action: "archive", blocked: "contracts" } : { action: "archive" };
  switch (product.status) {
    case "draft":
      return [{ action: "publish" }, archive];
    case "active":
      return [{ action: "retire" }];
    case "retiring":
      return [{ action: "reactivate" }, archive];
    default:
      return [];
  }
}

/** Metered divisions have a work price per unit; mobile a data volume; internet a bandwidth. */
export function optionFields(division: Division) {
  return {
    work: METERED.includes(division),
    volume: division === "mobile",
    bandwidth: division === "internet",
  };
}

export type FieldProblem =
  "required" | "pattern" | "length" | "range" | "price" | "duplicate" | "date";
export type FieldErrors = Record<string, FieldProblem>;

export interface OptionDraft {
  optionId: string;
  label: string;
  /** Base or monthly price in euros, e.g. "12,00". */
  monthly: string;
  /** Work price in cents per unit, e.g. "32,4" (metered). */
  work: string;
  /** Data volume in GB (mobile). */
  volume: string;
  /** Bandwidth in Mbit/s (internet). */
  bandwidth: string;
}

export interface ProductDraft {
  productId: string;
  division: string;
  name: string;
  description: string;
  minimumTermMonths: string;
  noticePeriodMonths: string;
  validFrom: string;
  options: OptionDraft[];
}

export const EMPTY_OPTION: OptionDraft = {
  optionId: "",
  label: "",
  monthly: "",
  work: "",
  volume: "",
  bandwidth: "",
};

export const MAX_OPTIONS = 6;
const PRODUCT_ID = /^[a-z0-9-]{2,40}$/;
const OPTION_ID = /^[a-z0-9-]{1,40}$/;
/** Paths of the zone that a product id must not shadow (`/produkte/neu`). */
const RESERVED_IDS = new Set(["neu"]);

function whole(text: string, min: number, max: number): number | undefined {
  if (!/^\d{1,6}$/.test(text.trim())) return undefined;
  const value = Number(text.trim());
  return value >= min && value <= max ? value : undefined;
}

/** The prices of one option from the form; errors under `${prefix}.<field>`. */
function optionOf(
  draft: OptionDraft,
  division: Division,
  prefix: string,
  errors: FieldErrors,
): ProductOption | undefined {
  const fields = optionFields(division);
  const optionId = draft.optionId.trim();
  const label = draft.label.trim();
  if (!optionId) errors[`${prefix}.optionId`] = "required";
  else if (!OPTION_ID.test(optionId)) errors[`${prefix}.optionId`] = "pattern";
  if (!label) errors[`${prefix}.label`] = "required";
  else if (label.length > 60) errors[`${prefix}.label`] = "length";
  const monthly = parseEuro(draft.monthly);
  if (monthly === undefined)
    errors[`${prefix}.monthly`] = draft.monthly.trim() ? "price" : "required";
  const option: ProductOption = { optionId, label, monthlyPriceCent: monthly ?? 0 };
  if (fields.work) {
    const work = parseCent(draft.work);
    if (work === undefined) errors[`${prefix}.work`] = draft.work.trim() ? "price" : "required";
    else option.workPriceCent = work;
  }
  if (fields.volume) {
    const gigabytes = whole(draft.volume, 1, 10000);
    if (gigabytes === undefined)
      errors[`${prefix}.volume`] = draft.volume.trim() ? "range" : "required";
    else option.dataVolumeMb = gigabytes * 1024;
  }
  if (fields.bandwidth && draft.bandwidth.trim()) {
    const mbit = whole(draft.bandwidth, 1, 100000);
    if (mbit === undefined) errors[`${prefix}.bandwidth`] = "range";
    else option.bandwidthMbit = mbit;
  }
  return Object.keys(errors).some((key) => key.startsWith(`${prefix}.`)) ? undefined : option;
}

/** Duplicate option ids mark the later rows. */
function checkDuplicates(options: readonly OptionDraft[], errors: FieldErrors) {
  const seen = new Set<string>();
  options.forEach((option, index) => {
    const id = option.optionId.trim();
    if (id && seen.has(id) && !errors[`options.${index}.optionId`])
      errors[`options.${index}.optionId`] = "duplicate";
    seen.add(id);
  });
}

/** The form "Produkt anlegen": a ProductInput, or the problems per field. */
export function validateProductDraft(
  draft: ProductDraft,
  today: string,
): { value?: ProductInput; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const productId = draft.productId.trim();
  if (!productId) errors.productId = "required";
  else if (!PRODUCT_ID.test(productId) || RESERVED_IDS.has(productId)) errors.productId = "pattern";
  const division = (DIVISIONS as readonly string[]).includes(draft.division)
    ? (draft.division as Division)
    : undefined;
  if (!division) errors.division = "required";
  const name = draft.name.trim();
  if (!name) errors.name = "required";
  else if (name.length < 2 || name.length > 60) errors.name = "length";
  const description = draft.description.trim();
  if (description.length > 400) errors.description = "length";
  const minimumTermMonths = whole(draft.minimumTermMonths, 0, 36);
  if (minimumTermMonths === undefined) errors.minimumTermMonths = "range";
  const noticePeriodMonths = whole(draft.noticePeriodMonths, 0, 12);
  if (noticePeriodMonths === undefined) errors.noticePeriodMonths = "range";
  const validFrom = draft.validFrom.trim();
  if (validFrom && (!isDate(validFrom) || validFrom < today)) errors.validFrom = "date";
  if (draft.options.length === 0 || draft.options.length > MAX_OPTIONS) errors.options = "range";
  const options = division
    ? draft.options.map((option, index) => optionOf(option, division, `options.${index}`, errors))
    : [];
  checkDuplicates(draft.options, errors);
  if (Object.keys(errors).length > 0 || !division) return { errors };
  return {
    errors,
    value: {
      productId,
      division,
      name,
      description,
      minimumTermMonths: minimumTermMonths ?? 0,
      noticePeriodMonths: noticePeriodMonths ?? 0,
      ...(validFrom ? { validFrom } : {}),
      options: options.filter((option): option is ProductOption => option !== undefined),
    },
  };
}

/** The form "Neue Preisversion": new prices for every option of the product's current version. */
export function validatePriceDraft(
  product: Pick<Product, "division" | "options">,
  draft: { validFrom: string; options: readonly OptionDraft[] },
  today: string,
): { value?: PriceVersionInput; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const validFrom = draft.validFrom.trim();
  if (!validFrom) errors.validFrom = "required";
  else if (!isDate(validFrom) || validFrom < today) errors.validFrom = "date";
  const work = optionFields(product.division).work;
  const options = product.options.map((current, index): ProductOption => {
    const row = draft.options[index] ?? EMPTY_OPTION;
    // Ids, labels, data volume and bandwidth stay; only the prices change.
    const next: ProductOption = { ...current };
    const monthly = parseEuro(row.monthly);
    if (monthly === undefined)
      errors[`options.${index}.monthly`] = row.monthly.trim() ? "price" : "required";
    else next.monthlyPriceCent = monthly;
    if (work) {
      const cents = parseCent(row.work);
      if (cents === undefined)
        errors[`options.${index}.work`] = row.work.trim() ? "price" : "required";
      else next.workPriceCent = cents;
    }
    return next;
  });
  if (Object.keys(errors).length > 0) return { errors };
  return { errors, value: { validFrom, options } };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const isText = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" && value.trim().length >= min && value.length <= max;

/** One option of the JSON body; undefined if a field is missing, malformed or unknown. */
function parseOption(value: unknown): ProductOption | undefined {
  if (!isObject(value)) return undefined;
  const { optionId, label, monthlyPriceCent, workPriceCent, dataVolumeMb, bandwidthMbit, ...rest } =
    value;
  if (Object.keys(rest).length > 0) return undefined;
  if (typeof optionId !== "string" || !OPTION_ID.test(optionId)) return undefined;
  if (!isText(label, 1, 60) || !isInt(monthlyPriceCent, 0, 1e7)) return undefined;
  const option: ProductOption = { optionId, label, monthlyPriceCent };
  if (workPriceCent !== undefined) {
    if (typeof workPriceCent !== "number" || !(workPriceCent >= 0 && workPriceCent < 1e5))
      return undefined;
    option.workPriceCent = workPriceCent;
  }
  if (dataVolumeMb !== undefined) {
    if (!isInt(dataVolumeMb, 1, 1e8)) return undefined;
    option.dataVolumeMb = dataVolumeMb;
  }
  if (bandwidthMbit !== undefined) {
    if (!isInt(bandwidthMbit, 1, 1e6)) return undefined;
    option.bandwidthMbit = bandwidthMbit;
  }
  return option;
}

function parseOptions(value: unknown): ProductOption[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_OPTIONS) return undefined;
  const options = value.map(parseOption);
  if (options.some((option) => option === undefined)) return undefined;
  const ids = new Set(options.map((option) => option?.optionId));
  return ids.size === options.length ? (options as ProductOption[]) : undefined;
}

/** Validates POST /admin/products from the browser (ProductInput). */
export function parseProductInput(body: unknown): ProductInput | undefined {
  if (!isObject(body)) return undefined;
  const {
    productId,
    division,
    name,
    description,
    minimumTermMonths,
    noticePeriodMonths,
    validFrom,
    options,
    ...rest
  } = body;
  if (Object.keys(rest).length > 0) return undefined;
  if (typeof productId !== "string" || !PRODUCT_ID.test(productId) || RESERVED_IDS.has(productId))
    return undefined;
  if (typeof division !== "string" || !(DIVISIONS as readonly string[]).includes(division))
    return undefined;
  if (!isText(name, 2, 60) || typeof description !== "string" || description.length > 400)
    return undefined;
  if (!isInt(minimumTermMonths, 0, 36) || !isInt(noticePeriodMonths, 0, 12)) return undefined;
  if (validFrom !== undefined && (typeof validFrom !== "string" || !isDate(validFrom)))
    return undefined;
  const parsed = parseOptions(options);
  if (!parsed) return undefined;
  return {
    productId,
    division: division as Division,
    name,
    description,
    minimumTermMonths,
    noticePeriodMonths,
    ...(validFrom ? { validFrom } : {}),
    options: parsed,
  };
}

/** Validates PATCH /admin/products/{id} (ProductUpdate): texts, terms or the status. */
export function parseProductUpdate(body: unknown): ProductUpdate | undefined {
  if (!isObject(body)) return undefined;
  const entries = Object.entries(body);
  if (entries.length === 0) return undefined;
  const update: ProductUpdate = {};
  for (const [key, value] of entries) {
    if (key === "name" && isText(value, 2, 60)) update.name = value;
    else if (key === "description" && typeof value === "string" && value.length <= 400)
      update.description = value;
    else if (key === "minimumTermMonths" && isInt(value, 0, 36)) update.minimumTermMonths = value;
    else if (key === "noticePeriodMonths" && isInt(value, 0, 12)) update.noticePeriodMonths = value;
    else if (key === "status" && (PRODUCT_STATUSES as readonly unknown[]).includes(value))
      update.status = value as ProductStatus;
    else return undefined;
  }
  return update;
}

/** Validates POST /admin/products/{id}/versions (PriceVersionInput), from today on. */
export function parsePriceVersionInput(
  body: unknown,
  today: string,
): PriceVersionInput | undefined {
  if (!isObject(body)) return undefined;
  const { validFrom, options, ...rest } = body;
  if (Object.keys(rest).length > 0) return undefined;
  if (typeof validFrom !== "string" || !isDate(validFrom) || validFrom < today) return undefined;
  const parsed = parseOptions(options);
  return parsed ? { validFrom, options: parsed } : undefined;
}

/** A product id in a path, as the contract allows it. */
export function isProductId(value: string): boolean {
  return PRODUCT_ID.test(value);
}
