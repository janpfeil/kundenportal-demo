/*
 * Reads of the operator's pages (GET /admin/*). Each call answers with the data or nothing
 * and the HTTP status, so a page shows "kein Zugriff" for a 403, "nicht gefunden" for a 404
 * and a notice for anything else — and a failing section never takes the page down. The API
 * scopes every answer to the caller's tenant and checks the operator groups itself.
 */

import type { components } from "@kundenportal/api-contract";
import { type Session, apiFor } from "@kundenportal/web-auth";
import { cache } from "react";
import type { ContractQuery, CustomerQuery } from "./filters";

export type OperatorOverview = components["schemas"]["OperatorOverview"];
export type CustomerPage = components["schemas"]["CustomerPage"];
export type CustomerSummary = components["schemas"]["CustomerSummary"];
export type ContractPage = components["schemas"]["ContractPage"];
export type OperatorContract = components["schemas"]["OperatorContract"];
export type HistoryEntry = components["schemas"]["ContractHistoryEntry"];
export type Notification = components["schemas"]["Notification"];
export type CustomerDocument = components["schemas"]["Document"];
export type MeterReading = components["schemas"]["MeterReading"];
export type Product = components["schemas"]["Product"];
export interface Items<T> {
  items: T[];
}
export interface ContractDetail {
  contract: OperatorContract;
  history: HistoryEntry[];
}

export interface Loaded<T> {
  data: T | undefined;
  /** HTTP status of the answer; 0 when the API was not reachable. */
  code: number;
}

async function load<T>(
  call: () => Promise<{ data?: T | null | undefined; response: Response }>,
): Promise<Loaded<T>> {
  try {
    const { data, response } = await call();
    return { data: response.ok ? (data ?? undefined) : undefined, code: response.status };
  } catch {
    return { data: undefined, code: 0 };
  }
}

/** True when the API refused the caller as operator (any section's 403). */
export function forbidden(...results: readonly Loaded<unknown>[]): boolean {
  return results.some((result) => result.code === 403);
}

export const loadOverview = (session: Session) =>
  load<OperatorOverview>(() => apiFor(session).GET("/admin/overview"));

export const loadCustomers = (session: Session, query: CustomerQuery) =>
  load<CustomerPage>(() => apiFor(session).GET("/admin/customers", { params: { query } }));

export const loadCustomer = (session: Session, customerId: string) =>
  load<CustomerSummary>(() =>
    apiFor(session).GET("/admin/customers/{customerId}", { params: { path: { customerId } } }),
  );

export const loadNotifications = (session: Session, customerId: string) =>
  load<Items<Notification>>(() =>
    apiFor(session).GET("/admin/customers/{customerId}/notifications", {
      params: { path: { customerId } },
    }),
  );

export const loadDocuments = (session: Session, customerId: string) =>
  load<Items<CustomerDocument>>(() =>
    apiFor(session).GET("/admin/customers/{customerId}/documents", {
      params: { path: { customerId } },
    }),
  );

export const loadContracts = (session: Session, query: ContractQuery) =>
  load<ContractPage>(() => apiFor(session).GET("/admin/contracts", { params: { query } }));

export const loadContract = (session: Session, contractId: string) =>
  load<ContractDetail>(() =>
    apiFor(session).GET("/admin/contracts/{contractId}", { params: { path: { contractId } } }),
  );

export const loadReadings = (session: Session, contractId: string) =>
  load<Items<MeterReading>>(() =>
    apiFor(session).GET("/admin/contracts/{contractId}/readings", {
      params: { path: { contractId } },
    }),
  );

/** The catalogue once per request: lists, filters and the contract page share it. */
export const loadProducts = cache((session: Session) =>
  load<Items<Product>>(() => apiFor(session).GET("/admin/products")),
);

export const loadProduct = (session: Session, productId: string) =>
  load<Product>(() =>
    apiFor(session).GET("/admin/products/{productId}", { params: { path: { productId } } }),
  );
