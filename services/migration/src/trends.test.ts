import { apiEvent } from "@kundenportal/service-kit/testing";
import { describe, expect, it } from "vitest";
import { createHandler } from "./api.js";
import { BulkImport } from "./bulk.js";
import { Cockpit } from "./cockpit.js";
import { Linking } from "./links.js";
import { type MigrationRecord, type RecordStatus, recordId } from "./model.js";
import { testContext } from "./testing.js";
import { migratedToday, migrationTrends } from "./trends.js";
import { createProcessor, createWorker } from "./worker.js";

const owner = { sub: "owner-sub", "cognito:groups": "[owner]" };
const caller = { tenantId: "owner", subject: "owner-sub" };

let numbers = 0;
function record(
  status: RecordStatus,
  updatedAt: string,
  extra: Partial<MigrationRecord> = {},
): MigrationRecord {
  return {
    account: { system: "utility", customerNumber: `V-${2000000 + numbers++}` },
    displayName: "Demo",
    status,
    attempts: 1,
    updatedAt,
    ...extra,
  };
}

describe("migrated today", () => {
  // 1 October 2026, 09:00 German summer time; the day began at 22:00 UTC on 30 September.
  const now = new Date("2026-10-01T07:00:00.000Z");

  it("counts migrated and linked records of the system since 00:00 German time", () => {
    const records = [
      record("migrated", "2026-09-30T22:00:00.000Z"),
      record("linked", "2026-10-01T06:59:00.000Z"),
      // 23:59 German time the day before.
      record("migrated", "2026-09-30T21:59:59.000Z"),
      record("failed", "2026-10-01T06:00:00.000Z"),
      record("clarification", "2026-10-01T06:00:00.000Z"),
      {
        ...record("migrated", "2026-10-01T05:00:00.000Z"),
        account: { system: "telco" as const, customerNumber: "T/1" },
      },
    ];
    expect(migratedToday(records, "utility", now)).toBe(2);
    expect(migratedToday(records, "telco", now)).toBe(1);
  });
});

describe("migration trends", () => {
  // 1 October 2026, 14:00 German summer time.
  const now = new Date("2026-10-01T12:00:00.000Z");

  it("names the last seven German days, today last", () => {
    expect(migrationTrends([], now)).toEqual({
      days: [
        "2026-09-25",
        "2026-09-26",
        "2026-09-27",
        "2026-09-28",
        "2026-09-29",
        "2026-09-30",
        "2026-10-01",
      ],
      clarifications: [0, 0, 0, 0, 0, 0, 0],
      deadLetters: [0, 0, 0, 0, 0, 0, 0],
      newClarifications: 0,
      redriven: 0,
    });
  });

  it("counts open clarification cases at the end of each day and the new ones", () => {
    const trends = migrationTrends(
      [
        record("clarification", "2026-09-20T10:00:00.000Z"),
        // 23:30 German time on 27 September still belongs to the 27th.
        record("clarification", "2026-09-27T21:30:00.000Z"),
        // 00:30 German time on 30 September, more than 24 hours ago.
        record("clarification", "2026-09-29T22:30:00.000Z"),
        record("clarification", "2026-10-01T08:00:00.000Z"),
        // Resolved cases are no longer open.
        record("migrated", "2026-09-26T10:00:00.000Z"),
      ],
      now,
    );
    expect(trends.clarifications).toEqual([1, 1, 2, 2, 2, 3, 4]);
    expect(trends.newClarifications).toBe(1);
  });

  it("counts dead letters while they were in the queue, redrives that held", () => {
    const trends = migrationTrends(
      [
        // Failed on the 26th and still failed.
        record("failed", "2026-09-28T10:00:00.000Z", { failedAt: "2026-09-26T10:00:00.000Z" }),
        // Failed before failedAt existed: its last update is the failure.
        record("failed", "2026-09-29T10:00:00.000Z"),
        // Failed on the 27th, redriven on the 29th, migrated: in the queue 27th and 28th.
        record("migrated", "2026-09-29T10:05:00.000Z", {
          failedAt: "2026-09-27T10:00:00.000Z",
          redrivenAt: "2026-09-29T10:00:00.000Z",
        }),
        // Redriven within the last 24 hours and migrated.
        record("migrated", "2026-10-01T09:00:00.000Z", {
          failedAt: "2026-09-25T10:00:00.000Z",
          redrivenAt: "2026-10-01T08:00:00.000Z",
        }),
        // Redriven an hour ago, failed again since: back in the queue, no redrive success.
        record("failed", "2026-10-01T11:30:00.000Z", {
          failedAt: "2026-10-01T11:30:00.000Z",
          redrivenAt: "2026-10-01T11:00:00.000Z",
        }),
        // Waiting for the processor after a redrive: out of the queue, not failed.
        record("queued", "2026-10-01T10:00:00.000Z", {
          failedAt: "2026-09-30T10:00:00.000Z",
          redrivenAt: "2026-10-01T10:00:00.000Z",
        }),
        // Never failed.
        record("migrated", "2026-09-28T10:00:00.000Z"),
      ],
      now,
    );
    //                         25 26 27 28 29 30  1
    expect(trends.deadLetters).toEqual([1, 2, 3, 3, 3, 4, 3]);
    expect(trends.redriven).toBe(2);
  });

  it("ends the days at German midnight across the change to winter time", () => {
    // 27 October 2026, 12:00 German winter time: the 25th had 25 hours.
    const later = new Date("2026-10-27T11:00:00.000Z");
    const trends = migrationTrends(
      [
        // 00:30 CET on the 26th = 23:30 UTC on the 25th: a case of the 26th.
        record("clarification", "2026-10-25T23:30:00.000Z"),
        // 23:30 CET on the 25th = 22:30 UTC on the 25th: a case of the 25th.
        record("clarification", "2026-10-25T22:30:00.000Z"),
        // 00:30 CEST on the 25th = 22:30 UTC on the 24th.
        record("clarification", "2026-10-24T22:30:00.000Z"),
        // Failed at 23:59 CET on the 25th, redriven at 00:00 CET on the 26th.
        record("migrated", "2026-10-26T00:00:00.000Z", {
          failedAt: "2026-10-25T22:59:00.000Z",
          redrivenAt: "2026-10-25T23:00:00.000Z",
        }),
      ],
      later,
    );
    expect(trends.days).toEqual([
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
    expect(trends.clarifications).toEqual([0, 0, 0, 0, 2, 3, 3]);
    expect(trends.deadLetters).toEqual([0, 0, 0, 0, 1, 0, 0]);
  });

  it("ends the days at German midnight across the change to summer time", () => {
    // 31 March 2026, 12:00 German summer time: the 29th had 23 hours.
    const later = new Date("2026-03-31T10:00:00.000Z");
    const trends = migrationTrends(
      [
        // 23:30 CEST on the 29th = 21:30 UTC.
        record("clarification", "2026-03-29T21:30:00.000Z"),
        // 00:30 CEST on the 30th = 22:30 UTC on the 29th.
        record("clarification", "2026-03-29T22:30:00.000Z"),
        // 00:30 CET on the 29th = 23:30 UTC on the 28th.
        record("clarification", "2026-03-28T23:30:00.000Z"),
      ],
      later,
    );
    expect(trends.days.slice(-3)).toEqual(["2026-03-29", "2026-03-30", "2026-03-31"]);
    expect(trends.clarifications).toEqual([0, 0, 0, 0, 2, 3, 3]);
  });
});

describe("failure and redrive times of a record", () => {
  function setup() {
    const t = testContext();
    let clock = new Date("2026-09-30T08:00:00.000Z");
    t.ctx.now = () => clock;
    const bulk = new BulkImport(t.ctx);
    const linking = new Linking(t.ctx);
    const cockpit = new Cockpit(t.ctx);
    return {
      ...t,
      bulk,
      cockpit,
      api: createHandler(bulk, linking, cockpit),
      worker: createWorker(bulk, linking, cockpit),
      processor: createProcessor(bulk),
      at: (iso: string) => {
        clock = new Date(iso);
      },
    };
  }
  const rainer = { system: "telco" as const, customerNumber: "T/88-4714" };

  async function failRainer(s: ReturnType<typeof setup>) {
    await s.bulk.start(caller, "telco", "corr");
    const started = s.published.find((p) => p.detailType === "BulkMigrationStarted");
    await s.worker({
      source: "kundenportal.migration",
      "detail-type": "BulkMigrationStarted",
      detail: started?.detail,
    });
    const task = s.dispatched.find((d) => d.account.customerNumber === rainer.customerNumber);
    await expect(s.processor(task)).rejects.toThrow();
    return task;
  }

  const redrive = (s: ReturnType<typeof setup>, body: unknown = {}) =>
    s.api(
      apiEvent("POST /migration/dlq/{recordId}/redrive", {
        claims: owner,
        pathParameters: { recordId: recordId(rainer) },
        body,
      }),
    );

  it("keeps the first failure while the record stays failed", async () => {
    const s = setup();
    const task = await failRainer(s);
    expect(await s.repository.getRecord("owner", rainer)).toMatchObject({
      status: "failed",
      failedAt: "2026-09-30T08:00:00.000Z",
    });
    // Lambda retries the asynchronous invocation.
    s.at("2026-09-30T08:05:00.000Z");
    await expect(s.processor(task)).rejects.toThrow();
    expect(await s.repository.getRecord("owner", rainer)).toMatchObject({
      status: "failed",
      attempts: 2,
      failedAt: "2026-09-30T08:00:00.000Z",
      updatedAt: "2026-09-30T08:05:00.000Z",
    });
  });

  it("records the redrive, keeps the failure and counts the redrive once it held", async () => {
    const s = setup();
    await failRainer(s);
    s.at("2026-10-01T09:00:00.000Z");
    expect((await redrive(s, { corrections: { postalCode: "04229" } })).statusCode).toBe(202);
    expect(await s.repository.getRecord("owner", rainer)).toMatchObject({
      status: "queued",
      failedAt: "2026-09-30T08:00:00.000Z",
      redrivenAt: "2026-10-01T09:00:00.000Z",
    });

    s.at("2026-10-01T09:01:00.000Z");
    await s.processor(s.dispatched.at(-1));
    // The migration's own event rewrites the record; the times survive it.
    const migrated = s.published.findLast((p) => p.detailType === "LegacyAccountMigrated");
    await s.worker({
      source: "kundenportal.migration",
      "detail-type": "LegacyAccountMigrated",
      detail: migrated?.detail,
    });
    expect(await s.repository.getRecord("owner", rainer)).toMatchObject({
      status: "migrated",
      failedAt: "2026-09-30T08:00:00.000Z",
      redrivenAt: "2026-10-01T09:00:00.000Z",
    });

    s.at("2026-10-01T12:00:00.000Z");
    const status = await s.cockpit.status(caller);
    expect(status.trends.redriven).toBe(1);
    expect(status.trends.deadLetters).toEqual([0, 0, 0, 0, 0, 1, 0]);
    expect(status.systems.find((x) => x.system === "telco")?.migratedToday).toBe(1);
  });

  it("starts a new failure after a redrive that failed again", async () => {
    const s = setup();
    await failRainer(s);
    s.at("2026-10-01T09:00:00.000Z");
    await redrive(s);
    s.at("2026-10-01T09:01:00.000Z");
    await expect(s.processor(s.dispatched.at(-1))).rejects.toThrow();
    expect(await s.repository.getRecord("owner", rainer)).toMatchObject({
      status: "failed",
      failedAt: "2026-10-01T09:01:00.000Z",
      redrivenAt: "2026-10-01T09:00:00.000Z",
    });
    s.at("2026-10-01T12:00:00.000Z");
    expect((await s.cockpit.status(caller)).trends.redriven).toBe(0);
  });

  it("dates a redriven record without failedAt by its last update", async () => {
    const s = setup();
    await failRainer(s);
    const stored = await s.repository.getRecord("owner", rainer);
    const { failedAt: _failedAt, ...old } = stored as MigrationRecord;
    await s.repository.putRecord("owner", { ...old, updatedAt: "2026-09-29T08:00:00.000Z" });
    s.at("2026-10-01T09:00:00.000Z");
    await redrive(s);
    expect((await s.repository.getRecord("owner", rainer))?.failedAt).toBe(
      "2026-09-29T08:00:00.000Z",
    );
  });

  it("answers the trends and today's migrations in the status", async () => {
    const s = setup();
    await failRainer(s);
    const response = await s.api(apiEvent("GET /migration/status", { claims: owner }));
    const body = JSON.parse(response.body ?? "{}");
    expect(body.systems).toEqual([
      expect.objectContaining({ system: "utility", migratedToday: 0 }),
      expect.objectContaining({ system: "telco", migratedToday: 0 }),
    ]);
    expect(body.trends).toMatchObject({
      days: expect.arrayContaining(["2026-09-30"]),
      deadLetters: [0, 0, 0, 0, 0, 0, 1],
      newClarifications: 0,
      redriven: 0,
    });
  });
});
