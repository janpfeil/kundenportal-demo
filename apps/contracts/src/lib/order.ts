/*
 * Ordering a product (`POST /contracts`): the checks of the order form in the browser and
 * of the zone's route handler, and how the API's error answers become messages.
 */
import { addDays, isIsoDate } from "./dates";
import { type ContractOrder, METERED, PRODUCT_ID, type Product } from "./products";

/** The start date lies between today and this many days ahead (German dates). */
export const MAX_START_DAYS = 90;

const METER_NUMBER = /^[\p{L}\p{N}][\p{L}\p{N} ./-]*$/u;
const MAX_READING = 1_000_000_000;

/** What the customer entered, as the form holds it (strings from the fields). */
export interface OrderInput {
  optionId: string;
  startDate: string;
  meterNumber: string;
  startReading: string;
  consent: boolean;
}

export type OrderField = keyof OrderInput;
export type OrderProblem =
  | "option"
  | "dateEmpty"
  | "dateRange"
  | "meterEmpty"
  | "meterFormat"
  | "readingEmpty"
  | "readingFormat"
  | "consent";

export type OrderCheck =
  | { ok: true; order: ContractOrder }
  | { ok: false; errors: Partial<Record<OrderField, OrderProblem>> };

/** The latest start date an order may name. */
export function latestStart(today: string): string {
  return addDays(today, MAX_START_DAYS);
}

/** Reads a meter value as typed: comma or point as decimal separator, no grouping. */
export function parseReading(input: string): number | undefined {
  const text = input.trim().replace(",", ".");
  if (text === "" || !/^\d+(\.\d+)?$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value <= MAX_READING ? value : undefined;
}

/**
 * Checks the order form against the product and today's date; on success the body of
 * `POST /contracts`. Metered divisions need the meter number and the reading at the start.
 */
export function checkOrder(
  input: OrderInput,
  product: Pick<Product, "productId" | "division" | "options">,
  today: string,
): OrderCheck {
  const errors: Partial<Record<OrderField, OrderProblem>> = {};
  if (!product.options.some((option) => option.optionId === input.optionId))
    errors.optionId = "option";

  const start = input.startDate.trim();
  if (start === "") errors.startDate = "dateEmpty";
  else if (!isIsoDate(start) || start < today || start > latestStart(today))
    errors.startDate = "dateRange";

  const metered = METERED.has(product.division);
  const meterNumber = input.meterNumber.trim();
  const reading = parseReading(input.startReading);
  if (metered) {
    if (meterNumber === "") errors.meterNumber = "meterEmpty";
    else if (meterNumber.length < 4 || meterNumber.length > 30 || !METER_NUMBER.test(meterNumber))
      errors.meterNumber = "meterFormat";
    if (input.startReading.trim() === "") errors.startReading = "readingEmpty";
    else if (reading === undefined) errors.startReading = "readingFormat";
  }
  if (!input.consent) errors.consent = "consent";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const order: ContractOrder = {
    productId: product.productId,
    optionId: input.optionId,
    startDate: start,
    consent: true,
  };
  if (metered) {
    order.meterNumber = meterNumber;
    order.startReading = reading ?? 0;
  }
  return { ok: true, order };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const ORDER_KEYS = new Set([
  "productId",
  "optionId",
  "startDate",
  "meterNumber",
  "startReading",
  "consent",
]);

/**
 * Validates the body the browser sends to the zone's order route; `undefined` if invalid.
 * The API checks the product, the option, the date range and the metered fields again.
 */
export function parseContractOrder(body: unknown): ContractOrder | undefined {
  if (!isRecord(body) || Object.keys(body).some((key) => !ORDER_KEYS.has(key))) return undefined;
  const { productId, optionId, startDate, meterNumber, startReading, consent } = body;
  if (typeof productId !== "string" || !PRODUCT_ID.test(productId)) return undefined;
  if (typeof optionId !== "string" || optionId.length < 1 || optionId.length > 40) return undefined;
  if (!isIsoDate(startDate)) return undefined;
  if (consent !== true) return undefined;
  const order: ContractOrder = { productId, optionId, startDate, consent };
  if (meterNumber !== undefined) {
    if (typeof meterNumber !== "string" || meterNumber.length < 4 || meterNumber.length > 30)
      return undefined;
    order.meterNumber = meterNumber;
  }
  if (startReading !== undefined) {
    if (
      typeof startReading !== "number" ||
      !Number.isFinite(startReading) ||
      startReading < 0 ||
      startReading > MAX_READING
    )
      return undefined;
    order.startReading = startReading;
  }
  return order;
}

export type OrderApiProblem = "session" | "unavailable" | "conflict" | "invalid" | "generic";

/**
 * Maps an error answer of `POST /contracts` to a message key: 404 means the product (or its
 * option) cannot be ordered (any more), 409 that the contract domain does not know the
 * customer's account yet (set up shortly after the first sign-in), 400/422 that the API
 * rejected a value.
 */
export function orderProblem(status: number): OrderApiProblem {
  if (status === 401) return "session";
  if (status === 404) return "unavailable";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "invalid";
  return "generic";
}
