/*
 * The filter bars of the customer, contract and product lists: plain GET forms, so the URL
 * keeps the state and the lists work without JavaScript. This module reads the URL's
 * parameters (dropping what is unknown or malformed), turns them into the API's query and
 * builds the links of the pages. Free of server APIs, so pages and tests use it alike.
 */

import type { components, paths } from "@kundenportal/api-contract";

export type Division = components["schemas"]["Division"];
export type ProductStatus = components["schemas"]["ProductStatus"];
export type CustomerQuery = NonNullable<paths["/admin/customers"]["get"]["parameters"]["query"]>;
export type ContractQuery = NonNullable<paths["/admin/contracts"]["get"]["parameters"]["query"]>;

export type SearchParams = Record<string, string | string[] | undefined>;

export const DIVISIONS = ["electricity", "gas", "water", "internet", "mobile"] as const;
export const METERED: readonly Division[] = ["electricity", "gas", "water"];
export const ORIGINS = ["registration", "legacy-utility", "legacy-telco"] as const;
export const CUSTOMER_CONTRACTS = ["active", "pending-termination", "terminated", "none"] as const;
export const CONTRACT_STATUSES = [
  "active",
  "pending-termination",
  "terminated",
  "blocked",
] as const;
export const PRODUCT_STATUSES = ["draft", "active", "retiring", "archived"] as const;

/** Sort orders of the customer list as one choice: newest/oldest first, name A–Z/Z–A. */
export const CUSTOMER_SORTS = {
  newest: { sort: "createdAt", order: "desc" },
  oldest: { sort: "createdAt", order: "asc" },
  name: { sort: "name", order: "asc" },
  "name-desc": { sort: "name", order: "desc" },
} as const satisfies Record<string, Pick<CustomerQuery, "sort" | "order">>;

/** Sort orders of the contract list: last changed, start, end of term. */
export const CONTRACT_SORTS = {
  updated: { sort: "updatedAt", order: "desc" },
  start: { sort: "startDate", order: "desc" },
  end: { sort: "endDate", order: "asc" },
} as const satisfies Record<string, Pick<ContractQuery, "sort" | "order">>;

export type CustomerSort = keyof typeof CUSTOMER_SORTS;
export type ContractSort = keyof typeof CONTRACT_SORTS;

/** Rows per page of the lists. */
export const PAGE_SIZE = 25;

/** The first value of a parameter (`?a=1&a=2` → "1"), trimmed. */
export function param(params: SearchParams, name: string): string {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** A search text as the API takes it (at most 60 characters); empty means none. */
function searchText(value: string): string {
  return value.replace(/\s+/g, " ").slice(0, 60);
}

/** The opaque cursor of the next page; only URL-safe characters, at most 1000. */
function cursorOf(value: string): string | undefined {
  return /^[A-Za-z0-9_\-.~+/=%:]{1,1000}$/.test(value) ? value : undefined;
}

/** A calendar date `YYYY-MM-DD` that exists. */
export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const PRODUCT_ID = /^[a-z0-9-]{2,40}$/;

/** Ids of customers and contracts in paths: what the contract allows, nothing that escapes. */
export const isCustomerId = (value: string) => /^[A-Za-z0-9_.:@+-]{1,80}$/.test(value);
export const isContractId = (value: string) => /^[0-9a-fA-F-]{8,64}$/.test(value);

export interface CustomerFilters {
  q: string;
  origin?: (typeof ORIGINS)[number] | undefined;
  division?: Division | undefined;
  contracts?: (typeof CUSTOMER_CONTRACTS)[number] | undefined;
  sort: CustomerSort;
  cursor?: string | undefined;
}

export function customerFilters(params: SearchParams): CustomerFilters {
  return {
    q: searchText(param(params, "q")),
    origin: oneOf(param(params, "origin"), ORIGINS),
    division: oneOf(param(params, "division"), DIVISIONS),
    contracts: oneOf(param(params, "contracts"), CUSTOMER_CONTRACTS),
    sort: oneOf(param(params, "sort"), Object.keys(CUSTOMER_SORTS) as CustomerSort[]) ?? "newest",
    cursor: cursorOf(param(params, "cursor")),
  };
}

/** The API query of GET /admin/customers for the filters (empty ones left out). */
export function customerQuery(filters: CustomerFilters, limit = PAGE_SIZE): CustomerQuery {
  return {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.origin ? { origin: filters.origin } : {}),
    ...(filters.division ? { division: filters.division } : {}),
    ...(filters.contracts ? { contracts: filters.contracts } : {}),
    ...CUSTOMER_SORTS[filters.sort],
    limit,
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
  };
}

export interface ContractFilters {
  q: string;
  division?: Division | undefined;
  status?: (typeof CONTRACT_STATUSES)[number] | undefined;
  product?: string | undefined;
  endsBefore?: string | undefined;
  sort: ContractSort;
  cursor?: string | undefined;
}

export function contractFilters(params: SearchParams): ContractFilters {
  const product = param(params, "product");
  const endsBefore = param(params, "endsBefore");
  return {
    q: searchText(param(params, "q")),
    division: oneOf(param(params, "division"), DIVISIONS),
    status: oneOf(param(params, "status"), CONTRACT_STATUSES),
    product: PRODUCT_ID.test(product) ? product : undefined,
    endsBefore: isDate(endsBefore) ? endsBefore : undefined,
    sort: oneOf(param(params, "sort"), Object.keys(CONTRACT_SORTS) as ContractSort[]) ?? "updated",
    cursor: cursorOf(param(params, "cursor")),
  };
}

/** The API query of GET /admin/contracts for the filters (empty ones left out). */
export function contractQuery(filters: ContractFilters, limit = PAGE_SIZE): ContractQuery {
  return {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.division ? { division: filters.division } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.product ? { productId: filters.product } : {}),
    ...(filters.endsBefore ? { endsBefore: filters.endsBefore } : {}),
    ...CONTRACT_SORTS[filters.sort],
    limit,
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
  };
}

export interface ProductFilters {
  division?: Division | undefined;
  status?: ProductStatus | undefined;
}

export function productFilters(params: SearchParams): ProductFilters {
  return {
    division: oneOf(param(params, "division"), DIVISIONS),
    status: oneOf(param(params, "status"), PRODUCT_STATUSES),
  };
}

type FilterValues = object;

/** The filters that narrow the list (search and selections, not the order or the page). */
export function activeFilters(filters: FilterValues): number {
  return Object.entries(filters).filter(
    ([key, value]) => key !== "sort" && key !== "cursor" && value !== undefined && value !== "",
  ).length;
}

/**
 * Link to a list with these filters, e.g. the next page (`cursor`) or the first one
 * (without). Empty values and the default order stay out of the URL.
 */
export function listHref(
  path: string,
  filters: FilterValues,
  cursor?: string,
  defaults: Record<string, string> = { sort: "newest" },
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key === "cursor" || value === undefined || value === "") continue;
    if (defaults[key] === value) continue;
    search.set(key, String(value));
  }
  if (cursor) search.set("cursor", cursor);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
