import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { apiEvent } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHandler } from "./api.js";
import { BulkImport } from "./bulk.js";
import { Cockpit } from "./cockpit.js";
import { Linking } from "./links.js";
import { type MigrationRecord, recordId, type TimelineEntry } from "./model.js";
import { matchRecords, matchTimeline, searchQuery } from "./search.js";
import { testContext } from "./testing.js";

const owner = { sub: "owner-sub", "cognito:groups": "[owner]" };
const PASS = "p4k7x2qa";

const record = (
  customerNumber: string,
  displayName: string,
  updatedAt: string,
  extra: Partial<MigrationRecord> = {},
): MigrationRecord => ({
  account: { system: customerNumber.startsWith("T/") ? "telco" : "utility", customerNumber },
  displayName,
  status: "migrated",
  attempts: 1,
  updatedAt,
  ...extra,
});

const entry = (eventId: string, detailType: string, summary: string, occurredAt: string) => ({
  eventId,
  source: "kundenportal.migration",
  detailType,
  summary,
  occurredAt,
});

const RECORDS: MigrationRecord[] = [
  record("V-1000123", "Anna Becker", "2026-09-30T10:00:00.000Z"),
  record("T/88-4714", "Rainer Otto", "2026-09-30T11:00:00.000Z", {
    status: "failed",
    problem: { code: "missing-required-field", message: "Postleitzahl fehlt", fields: ["plz"] },
  }),
  record("T/88-4713", "Helga Kraus", "2026-09-30T09:00:00.000Z", { status: "clarification" }),
];

const TIMELINE: TimelineEntry[] = [
  entry("e-1", "LegacyAccountMigrated", "utility:V-1000123 bulk", "2026-09-30T10:00:00.000Z"),
  entry("e-2", "MigrationRecordFailed", "telco:T/88-4714 missing", "2026-09-30T11:00:00.000Z"),
  entry("e-3", "BulkMigrationStarted", "telco", "2026-09-30T08:00:00.000Z"),
];

describe("search query", () => {
  it("trims the query and takes 2 to 60 characters", () => {
    expect(searchQuery("  4714 ")).toBe("4714");
    expect(searchQuery("ab")).toBe("ab");
    for (const bad of [undefined, "", " a ", "x".repeat(61)]) {
      expect(() => searchQuery(bad)).toThrow(expect.objectContaining({ status: 400 }));
    }
  });
});

describe("matching", () => {
  it("finds records by number, name, status, problem and system:number, any case", () => {
    const numbers = (query: string) =>
      matchRecords(RECORDS, query).map((r) => r.account.customerNumber);
    expect(numbers("v-1000123")).toEqual(["V-1000123"]);
    expect(numbers("BECKER")).toEqual(["V-1000123"]);
    expect(numbers("clarif")).toEqual(["T/88-4713"]);
    expect(numbers("postleitzahl")).toEqual(["T/88-4714"]);
    expect(numbers("missing-required")).toEqual(["T/88-4714"]);
    expect(numbers("telco:t/88")).toEqual(["T/88-4714", "T/88-4713"]);
    expect(numbers("nobody")).toEqual([]);
  });

  it("finds events by type, summary and id, newest first", () => {
    const ids = (query: string) => matchTimeline(TIMELINE, query).map((e) => e.eventId);
    expect(ids("migrat")).toEqual(["e-2", "e-1", "e-3"]);
    expect(ids("t/88-4714")).toEqual(["e-2"]);
    expect(ids("E-3")).toEqual(["e-3"]);
  });

  it("returns at most ten hits each, the newest", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      record(`V-${1000200 + i}`, "Demo", `2026-09-${String(10 + i).padStart(2, "0")}T10:00:00Z`),
    );
    const hits = matchRecords(many, "demo");
    expect(hits).toHaveLength(10);
    expect(hits[0]?.account.customerNumber).toBe("V-1000214");
    expect(hits.at(-1)?.account.customerNumber).toBe("V-1000205");
    const events = Array.from({ length: 12 }, (_, i) =>
      entry(`e-${i}`, "Demo", "x", `2026-09-${String(10 + i).padStart(2, "0")}T10:00:00Z`),
    );
    expect(matchTimeline(events, "demo")).toHaveLength(10);
  });
});

function setup() {
  const t = testContext({ [PASS]: "active" });
  for (const r of RECORDS) t.repository.records.set(`owner|${refOf(r)}`, r);
  t.repository.timeline = [...TIMELINE];
  const cockpit = new Cockpit(t.ctx);
  return {
    ...t,
    api: createHandler(new BulkImport(t.ctx), new Linking(t.ctx), cockpit),
  };
}
const refOf = (r: MigrationRecord) => `${r.account.system}:${r.account.customerNumber}`;

describe("GET /migration/search", () => {
  it("answers accounts as cockpit records and events of the caller's tenant", async () => {
    const s = setup();
    const response = await s.api(
      apiEvent("GET /migration/search", { claims: owner, query: { q: " 4714 " } }),
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "{}")).toEqual({
      query: "4714",
      accounts: [
        {
          id: recordId({ system: "telco", customerNumber: "T/88-4714" }),
          system: "telco",
          customerNumber: "T/88-4714",
          displayName: "Rainer Otto",
          status: "failed",
          code: "missing-required-field",
          message: "Postleitzahl fehlt",
          fields: ["plz"],
          attempts: 1,
          updatedAt: "2026-09-30T11:00:00.000Z",
        },
      ],
      events: [TIMELINE[1]],
    });
    // One page of the timeline, larger than the status's.
    expect(s.repository.timelineLimits).toEqual([200]);
  });

  it("refuses a query that is too short or missing", async () => {
    const s = setup();
    const short = await s.api(
      apiEvent("GET /migration/search", { claims: owner, query: { q: "x" } }),
    );
    expect(short.statusCode).toBe(400);
    expect(short.headers?.["content-type"]).toBe("application/problem+json");
    const missing = await s.api(apiEvent("GET /migration/search", { claims: owner }));
    expect(missing.statusCode).toBe(400);
  });

  it("is for the cockpit's operators only", async () => {
    const s = setup();
    const customer = await s.api(
      apiEvent("GET /migration/search", { claims: { sub: "c" }, query: { q: "anna" } }),
    );
    expect(customer.statusCode).toBe(403);
  });
});

describe("GET /migration/search of a pass holder", () => {
  const dbMock = mockClient(DynamoDBDocumentClient);
  const holder = { sub: "holder", tenant_id: PASS, "cognito:groups": "[pass]" };

  beforeEach(() => {
    dbMock.reset();
    // The router's quota guard reads the pass's status from the base table.
    vi.stubEnv("TABLE_NAME", "base-table");
    dbMock
      .on(GetCommand, { Key: { PK: "PLATFORM", SK: `TENANT#${PASS}` } })
      .resolves({ Item: { status: "active" } });
    dbMock.on(UpdateCommand).resolves({});
  });

  it("searches the own pass tenant only", async () => {
    const s = setup();
    s.repository.records.set(`${PASS}|utility:V-1000123`, {
      ...(RECORDS[0] as MigrationRecord),
      displayName: "Anna Pass",
    });
    const response = await s.api(
      apiEvent("GET /migration/search", { claims: holder, query: { q: "anna" } }),
    );
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body ?? "{}");
    expect(body.accounts.map((a: { displayName: string }) => a.displayName)).toEqual(["Anna Pass"]);
  });

  it("keeps the pass group out of the owner's tenant", async () => {
    const s = setup();
    const response = await s.api(
      apiEvent("GET /migration/search", {
        claims: { ...holder, tenant_id: "owner" },
        query: { q: "anna" },
      }),
    );
    expect(response.statusCode).toBe(403);
  });
});
