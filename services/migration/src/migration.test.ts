import { customerIdFor, LegacyAccountMigrated } from "@kundenportal/events";
import { apiEvent } from "@kundenportal/service-kit/testing";
import { describe, expect, it } from "vitest";
import { createHandler, groupsOf } from "./api.js";
import { BulkImport, RecordFailedError } from "./bulk.js";
import { Cockpit, summarize } from "./cockpit.js";
import { Linking, matchAccounts } from "./links.js";
import { recordId } from "./model.js";
import { PASSWORD, testContext } from "./testing.js";
import { createProcessor, createWorker } from "./worker.js";

const owner = { sub: "owner-sub", "cognito:groups": "[owner]" };
const caller = { tenantId: "owner", subject: "owner-sub" };
const telco = (customerNumber: string) => ({ system: "telco" as const, customerNumber });

function setup() {
  const t = testContext();
  const bulk = new BulkImport(t.ctx);
  const linking = new Linking(t.ctx);
  const cockpit = new Cockpit(t.ctx);
  return { ...t, bulk, linking, cockpit, api: createHandler(bulk, linking, cockpit) };
}

async function startedTelcoRun(s: ReturnType<typeof setup>) {
  const run = await s.bulk.start(caller, "telco", "corr");
  const started = s.published.find((p) => p.detailType === "BulkMigrationStarted");
  await createWorker(
    s.bulk,
    s.linking,
    s.cockpit,
  )({
    source: "kundenportal.migration",
    "detail-type": "BulkMigrationStarted",
    detail: started?.detail,
  });
  return run;
}

describe("bulk import", () => {
  it("starts a run once per system at a time", async () => {
    const s = setup();
    const run = await s.bulk.start(caller, "telco", "corr");
    expect(run).toMatchObject({ system: "telco", status: "running" });
    expect(s.types()).toEqual(["BulkMigrationStarted"]);
    await expect(s.bulk.start(caller, "telco", "corr")).rejects.toMatchObject({ status: 409 });
    await expect(s.bulk.start(caller, "utility", "corr")).resolves.toBeDefined();
  });

  it("dispatches only inactive accounts and leaves active ones to the lazy migration", async () => {
    const s = setup();
    const run = await startedTelcoRun(s);
    expect(s.dispatched.map((task) => task.account.customerNumber)).toEqual([
      "T/88-4712",
      "T/88-4713",
      "T/88-4714",
    ]);
    expect((await s.repository.getRecord("owner", telco("T/88-4711")))?.status).toBe(
      "pending-lazy",
    );
    expect(s.repository.runs.get(run.runId)).toMatchObject({
      dispatched: 3,
      counts: { read: 4, skippedActive: 1 },
    });
  });

  it("migrates Carla without password, sends a reset request, clarifies Helga, fails Rainer", async () => {
    const s = setup();
    const run = await startedTelcoRun(s);
    const processor = createProcessor(s.bulk);
    const [carla, helga, rainer] = s.dispatched;

    await processor(carla);
    const migrated = s.published.find((p) => p.detailType === "LegacyAccountMigrated");
    expect(LegacyAccountMigrated.detail.parse(migrated?.detail).payload).toMatchObject({
      customerId: customerIdFor("owner", "sub-carla.schulz@example.net"),
      mode: "bulk",
      passwordMigrated: false,
      account: telco("T/88-4712"),
    });
    expect(
      s.published.find((p) => p.detailType === "PasswordResetRequired")?.detail.payload,
    ).toMatchObject({
      reason: "hash-not-transferable",
    });

    await processor(helga);
    expect(await s.repository.getRecord("owner", telco("T/88-4713"))).toMatchObject({
      status: "clarification",
      problem: { code: "invalid-field", fields: ["email"] },
    });

    await expect(processor(rainer)).rejects.toBeInstanceOf(RecordFailedError);
    expect(await s.repository.getRecord("owner", telco("T/88-4714"))).toMatchObject({
      status: "failed",
      attempts: 1,
      problem: { code: "missing-required-field", fields: ["postalCode"] },
    });
    expect(s.types()).toContain("MigrationRecordFailed");

    const completed = s.published.find((p) => p.detailType === "BulkMigrationCompleted");
    expect(completed?.detail.payload).toMatchObject({
      runId: run.runId,
      counts: {
        read: 4,
        migrated: 1,
        skippedActive: 1,
        clarification: 1,
        failed: 1,
        alreadyMigrated: 0,
      },
    });
  });

  it("counts an already migrated account instead of creating it twice", async () => {
    const s = setup();
    await startedTelcoRun(s);
    const [carla] = s.dispatched;
    await createProcessor(s.bulk)(carla);
    await createProcessor(s.bulk)(carla);
    expect(s.provisioned).toEqual(["carla.schulz@example.net"]);
  });

  it("fails a record whose address belongs to another portal account", async () => {
    const s = setup();
    await startedTelcoRun(s);
    s.failProvisioning("taken");
    await expect(createProcessor(s.bulk)(s.dispatched[0])).rejects.toThrow("taken");
    expect((await s.repository.getRecord("owner", telco("T/88-4712")))?.problem?.code).toBe(
      "identity-conflict",
    );
  });
});

describe("redrive", () => {
  it("takes the task out of the DLQ and processes it again with the operator's correction", async () => {
    const s = setup();
    await startedTelcoRun(s);
    await expect(createProcessor(s.bulk)(s.dispatched[2])).rejects.toThrow();
    const id = recordId(telco("T/88-4714"));

    const response = await s.api(
      apiEvent("POST /migration/dlq/{recordId}/redrive", {
        claims: owner,
        pathParameters: { recordId: id },
        body: { corrections: { postalCode: "04229" } },
      }),
    );
    expect(response.statusCode).toBe(202);
    expect(s.removed).toEqual([telco("T/88-4714")]);
    const task = s.dispatched.at(-1);
    expect(task).toMatchObject({
      account: telco("T/88-4714"),
      corrections: { postalCode: "04229" },
    });

    await createProcessor(s.bulk)(task);
    expect(await s.repository.getRecord("owner", telco("T/88-4714"))).toMatchObject({
      status: "migrated",
      attempts: 2,
      corrections: { postalCode: "04229" },
    });
  });

  it("refuses to redrive a record that is not failed or unknown, and bad corrections", async () => {
    const s = setup();
    await startedTelcoRun(s);
    const redrive = (id: string, body: unknown = {}) =>
      s.api(
        apiEvent("POST /migration/dlq/{recordId}/redrive", {
          claims: owner,
          pathParameters: { recordId: id },
          body,
        }),
      );
    expect((await redrive(recordId(telco("T/88-4711")))).statusCode).toBe(409);
    expect((await redrive("bm9wZQ")).statusCode).toBe(404);
    await expect(createProcessor(s.bulk)(s.dispatched[2])).rejects.toThrow();
    const bad = await redrive(recordId(telco("T/88-4714")), { corrections: { postalCode: "1" } });
    expect(bad.statusCode).toBe(400);
  });
});

const berndMigrated = {
  eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  tenantId: "owner",
  occurredAt: "2026-09-30T12:00:00.000Z",
  correlationId: "c",
  payload: {
    customerId: customerIdFor("owner", "sub-bernd"),
    subject: "sub-bernd",
    email: "bernd.yilmaz@example.org",
    displayName: "Bernd Yilmaz",
    locale: "de",
    account: { system: "utility", customerNumber: "V-1000124" },
    mode: "lazy",
    passwordMigrated: true,
    profile: {
      firstName: "Bernd",
      lastName: "Yilmaz",
      birthDate: "1979-11-02",
      address: { street: "Hauptstraße", houseNumber: "5", postalCode: "04103", city: "Leipzig" },
    },
    contracts: [],
  },
} as const;

describe("duplicates and linking", () => {
  const bernd = { sub: "sub-bernd" };

  async function offered() {
    const s = setup();
    await createWorker(
      s.bulk,
      s.linking,
      s.cockpit,
    )({
      source: "kundenportal.identity",
      "detail-type": "LegacyAccountMigrated",
      detail: berndMigrated,
    });
    return s;
  }

  it("records the lazy migration and offers Bernd his telco account", async () => {
    const s = await offered();
    expect((await s.repository.getRecord("owner", berndMigrated.payload.account))?.status).toBe(
      "migrated",
    );
    const found = s.published.find((p) => p.detailType === "DuplicateCandidateFound");
    expect(found?.detail.payload).toMatchObject({
      candidate: telco("T/88-4711"),
      candidateSummary: { displayName: "Bernd Yilmaz", address: "Hauptstraße 5, 04103 Leipzig" },
      matchedOn: ["name", "address", "birthDate"],
      score: 1,
    });
    const links = await s.api(apiEvent("GET /me/links", { claims: bernd }));
    expect(JSON.parse(links.body ?? "{}").links).toHaveLength(1);
    expect(s.repository.timeline[0]).toMatchObject({ detailType: "LegacyAccountMigrated" });
  });

  it("links only with the other account's password and moves its contracts", async () => {
    const s = await offered();
    const confirm = (password: string) =>
      s.api(
        apiEvent("POST /me/links", {
          claims: bernd,
          body: { system: "telco", customerNumber: "T/88-4711", password },
        }),
      );
    expect((await confirm("falsch")).statusCode).toBe(403);
    const ok = await confirm(PASSWORD);
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body ?? "{}")).toMatchObject({ status: "linked" });
    const linked = s.published.filter((p) => p.detailType === "AccountsLinked");
    expect(linked).toHaveLength(1);
    expect(linked[0]?.detail.payload).toMatchObject({
      customerId: berndMigrated.payload.customerId,
      linked: telco("T/88-4711"),
      contracts: [{ division: "internet", tariffOption: "250", monthlyInstallmentCent: 4499 }],
    });
    expect((await s.repository.getRecord("owner", telco("T/88-4711")))?.status).toBe("linked");
    await confirm(PASSWORD);
    expect(s.published.filter((p) => p.detailType === "AccountsLinked")).toHaveLength(1);
  });

  it("has no offer for other customers and validates the request", async () => {
    const s = await offered();
    const other = await s.api(
      apiEvent("POST /me/links", {
        claims: { sub: "someone" },
        body: { system: "telco", customerNumber: "T/88-4711", password: PASSWORD },
      }),
    );
    expect(other.statusCode).toBe(404);
    const invalid = await s.api(
      apiEvent("POST /me/links", { claims: bernd, body: { system: "x" } }),
    );
    expect(invalid.statusCode).toBe(400);
  });

  it("does not offer an account that is already migrated", async () => {
    const s = setup();
    await s.repository.putRecord(
      "owner",
      {
        account: telco("T/88-4711"),
        displayName: "B",
        status: "migrated",
        attempts: 0,
        updatedAt: "x",
      },
      true,
    );
    await s.linking.onMigrated(berndMigrated as never);
    expect(s.types()).not.toContain("DuplicateCandidateFound");
  });

  it("needs more than the name to call two accounts the same person", () => {
    const candidate = {
      ok: true as const,
      account: telco("T/1"),
      email: "x@example.net",
      displayName: "Bernd Yilmaz",
      profile: {
        firstName: "Bernd",
        lastName: "Yilmaz",
        address: { street: "Ringstraße", houseNumber: "9", postalCode: "04109", city: "Leipzig" },
      },
      contracts: [],
      lastSignInAt: "x",
    };
    const { profile } = berndMigrated.payload;
    expect(
      matchAccounts({ ...profile, birthDate: undefined } as never, "b@example.org", candidate),
    ).toBeUndefined();
  });
});

describe("cockpit", () => {
  it("is for the owner group only", async () => {
    const s = setup();
    const denied = await s.api(apiEvent("GET /migration/status", { claims: { sub: "x" } }));
    expect(denied.statusCode).toBe(403);
    const bulk = await s.api(
      apiEvent("POST /migration/bulk", { claims: { sub: "x" }, body: { system: "telco" } }),
    );
    expect(bulk.statusCode).toBe(403);
  });

  it("shows progress per system, clarification cases, dead letters and the timeline", async () => {
    const s = setup();
    await startedTelcoRun(s);
    const processor = createProcessor(s.bulk);
    await processor(s.dispatched[0]);
    await processor(s.dispatched[1]);
    await expect(processor(s.dispatched[2])).rejects.toThrow();

    const response = await s.api(apiEvent("GET /migration/status", { claims: owner }));
    expect(response.statusCode).toBe(200);
    const status = JSON.parse(response.body ?? "{}");
    expect(status.systems[1]).toMatchObject({
      system: "telco",
      total: 4,
      counts: { migrated: 1, clarification: 1, failed: 1, "pending-lazy": 1 },
    });
    expect(status.systems[0]).toMatchObject({ system: "utility", total: 3 });
    expect(status.clarifications[0]).toMatchObject({
      customerNumber: "T/88-4713",
      displayName: "Helga Kraus",
    });
    expect(status.deadLetters[0]).toMatchObject({
      customerNumber: "T/88-4714",
      fields: ["postalCode"],
    });
    expect(status.runs).toHaveLength(1);
    expect(status.timeline[0]).toMatchObject({
      detailType: "BulkMigrationStarted",
      summary: "telco",
    });
  });

  it("resets the demo: removes migrated accounts (never the caller's), records and the DLQ", async () => {
    const s = setup();
    await startedTelcoRun(s);
    await createProcessor(s.bulk)(s.dispatched[0]);
    await s.repository.putRecord(
      "owner",
      {
        account: { system: "utility", customerNumber: "V-1" },
        displayName: "Owner",
        status: "migrated",
        subject: "owner-sub",
        attempts: 0,
        updatedAt: "x",
      },
      true,
    );
    const carla = "sub-carla.schulz@example.net";
    await s.repository.putOffer("owner", carla, {
      customerId: customerIdFor("owner", carla),
      account: telco("T/88-4712"),
      candidate: { system: "utility", customerNumber: "V-1000124" },
      displayName: "Bernd Yilmaz",
      address: "Hauptstraße 5, 04103 Leipzig",
      matchedOn: ["name"],
      score: 0.5,
      status: "offered",
      offeredAt: "x",
    });
    const response = await s.api(apiEvent("POST /migration/reset", { claims: owner }));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "{}")).toMatchObject({ accountsRemoved: 1 });
    expect(s.removedAccounts).toEqual([carla]);
    expect(await s.repository.listRecords("owner")).toEqual([]);
    expect(s.repository.runs.size).toBe(0);
    expect(s.purges()).toBe(1);
    // Every domain learns which customers to delete; the caller's own account stays.
    const removed = s.published.filter((p) => p.detailType === "MigratedAccountsRemoved");
    expect(removed.map((p) => p.detail.payload)).toEqual([
      {
        reason: "demo-reset",
        accounts: [{ subject: carla, customerId: customerIdFor("owner", carla) }],
      },
    ]);
    expect(s.repository.clearedSubjects).toEqual([`owner|${carla}`]);
    expect(await s.repository.listOffers("owner", carla)).toEqual([]);
    expect(s.repository.timeline).toEqual([]);
    const denied = await s.api(apiEvent("POST /migration/reset", { claims: { sub: "x" } }));
    expect(denied.statusCode).toBe(403);
  });

  it("announces many removed accounts in chunks, also those whose user was gone already", async () => {
    const s = setup();
    for (let i = 0; i < 150; i++) {
      await s.repository.putRecord("owner", {
        account: telco(`T/${i}`),
        displayName: "x",
        status: "migrated",
        subject: `sub-${i}`,
        ...(i === 0 ? { customerId: "kept-id" } : {}),
        attempts: 0,
        updatedAt: "x",
      });
    }
    await s.cockpit.reset(caller, "corr-reset");
    const chunks = s.published
      .filter((p) => p.detailType === "MigratedAccountsRemoved")
      .map((p) => p.detail.payload.accounts as { subject: string; customerId: string }[]);
    expect(chunks.map((c) => c.length)).toEqual([100, 50]);
    expect(chunks[0]?.[0]).toEqual({ subject: "sub-0", customerId: "kept-id" });
    expect(chunks[1]?.[49]).toEqual({
      subject: "sub-149",
      customerId: customerIdFor("owner", "sub-149"),
    });
  });

  it("publishes nothing when no migrated identity is left", async () => {
    const s = setup();
    await s.cockpit.reset(caller);
    expect(s.types()).not.toContain("MigratedAccountsRemoved");
  });

  it("starts a bulk import for a valid system only", async () => {
    const s = setup();
    const bad = await s.api(
      apiEvent("POST /migration/bulk", { claims: owner, body: { system: "gas" } }),
    );
    expect(bad.statusCode).toBe(400);
    const ok = await s.api(
      apiEvent("POST /migration/bulk", { claims: owner, body: { system: "utility" } }),
    );
    expect(ok.statusCode).toBe(202);
  });

  it("reads groups from the authorizer's string and array form", () => {
    const event = (groups: unknown) =>
      ({
        requestContext: { authorizer: { jwt: { claims: { "cognito:groups": groups } } } },
      }) as never;
    expect(groupsOf(event("[owner other]"))).toEqual(["owner", "other"]);
    expect(groupsOf(event(["owner"]))).toEqual(["owner"]);
    expect(groupsOf(event(undefined))).toEqual([]);
  });

  it("keeps names and addresses out of the timeline", () => {
    const summary = summarize("DuplicateCandidateFound", {
      payload: {
        account: { system: "utility", customerNumber: "V-1000124" },
        candidate: telco("T/88-4711"),
        candidateSummary: { displayName: "Bernd Yilmaz", address: "Hauptstraße 5" },
      },
    });
    expect(summary).toBe("utility:V-1000124 → telco:T/88-4711");
    expect(summarize("ContractChanged", { payload: { contract: { division: "gas" } } })).toBe(
      "gas",
    );
  });
});
