import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { ApiEvent } from "@kundenportal/service-kit";
import { apiEvent, fixedTenantData } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { createApi } from "../app.js";
import type { ContractRecord } from "../contract.js";
import { ContractEvents } from "../publisher.js";
import { buildDomain } from "../wiring.js";
import { createWorker } from "../worker.js";
import { MemoryTable } from "./memory-table.js";

/** 2 October 2026, 12:00 German time. */
export const NOW = "2026-10-02T10:00:00.000Z";

/**
 * The contract domain against an in-memory table and a mocked EventBridge (tests only):
 * `reset()` before each test; `clock.at` moves time.
 */
export function fixture() {
  const dbMock = mockClient(DynamoDBDocumentClient);
  const ebMock = mockClient(EventBridgeClient);
  const clock = { at: new Date(NOW), now: () => clock.at };
  const domain = buildDomain(
    fixedTenantData(),
    new ContractEvents(new EventBridgeClient({}), "bus"),
    clock,
  );
  const state = { table: new MemoryTable(dbMock) };
  return {
    dbMock,
    ebMock,
    clock,
    domain,
    api: createApi(domain),
    worker: createWorker(domain.intake),
    get table() {
      return state.table;
    },
    reset() {
      dbMock.reset();
      ebMock.reset();
      state.table = new MemoryTable(dbMock);
      ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });
      clock.at = new Date(NOW);
    },
    /** Events sent to EventBridge, in order. */
    published() {
      return ebMock
        .commandCalls(PutEventsCommand)
        .flatMap((call) => call.args[0].input.Entries ?? [])
        .map((entry) => ({ type: entry.DetailType, detail: JSON.parse(entry.Detail ?? "{}") }));
    },
    /** Number of items written per command type (capacity checks). */
    writes() {
      return dbMock.calls().map((call) => (call.args[0] as object).constructor.name);
    },
  };
}

export const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "null");

/** A customer's request (subject `sub-1` of tenant `owner`). */
export const asCustomer = (
  routeKey: string,
  options: Parameters<typeof apiEvent>[1] = {},
): ApiEvent => apiEvent(routeKey, options);

/** The operator's request (Cognito group `owner`). */
export const asOperator = (
  routeKey: string,
  options: Parameters<typeof apiEvent>[1] = {},
): ApiEvent =>
  apiEvent(routeKey, { ...options, claims: { "cognito:groups": "[owner]", ...options.claims } });

/** Items for a customer link and contracts as the table stores them. */
export function linkItem(tenantId = "owner", subject = "sub-1", customerId = "c-1") {
  return {
    PK: `TENANT#${tenantId}#SUBJ#${subject}`,
    SK: "CONTRACTS",
    customerId,
    customerName: "Anna Muster",
  };
}

export function contractItem(record: ContractRecord, tenantId = "owner") {
  return {
    PK: `TENANT#${tenantId}#CUST#${record.customerId}`,
    SK: `CONTRACT#${record.division}#${record.contractId}`,
    ...record,
  };
}
