import { DemoPassIssued, TenantDeleted, TenantProvisioned } from "@kundenportal/events";
import { describe, expect, it } from "vitest";
import { createCleanup } from "./cleanup.js";
import { activatePass, endPass, teardownAllTenants, teardownTenant } from "./lifecycle.js";
import { Passes } from "./passes.js";
import { testContext } from "./testing.js";
import { createWorker } from "./worker.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A redeemed pass whose DemoPassIssued event has not been handled yet. */
async function issuedPass(t: ReturnType<typeof testContext>, email = "visitor@example.org") {
  const passes = new Passes(t.ctx);
  const { link } = await passes.invite(
    { tenantId: "owner", subject: "owner-sub" },
    { email },
    "corr",
  );
  await passes.redeem(link.split("#")[1] ?? "", "corr");
  const event = t.published.at(-1);
  const detail = DemoPassIssued.detail.parse(event?.detail);
  return {
    ...detail.payload,
    event: { source: "kundenportal.tenancy", "detail-type": "DemoPassIssued", detail },
  };
}

function setup() {
  const t = testContext();
  return { ...t, worker: createWorker(t.ctx) };
}

async function activePass(s: ReturnType<typeof setup>, email?: string) {
  const pass = await issuedPass(s, email);
  await s.worker(pass.event);
  return pass;
}

const expiredEvent = (s: ReturnType<typeof setup>) => ({
  source: "kundenportal.tenancy",
  "detail-type": "DemoPassExpired",
  detail: s.published.findLast((p) => p.detailType === "DemoPassExpired")?.detail,
});

describe("provisioning", () => {
  it("creates table, legacy data, holder account and schedule, then activates", async () => {
    const s = setup();
    const { tenantId, passId, event } = await issuedPass(s);
    s.advance(20_000);
    await s.worker(event);

    const table = `kp-tenant-${tenantId}`;
    expect(s.calls).toEqual([
      `table:create:${table}`,
      `legacy:provision:${tenantId}`,
      "account:create:visitor@example.org",
      `schedule:create:${tenantId}`,
      `reminder:create:${tenantId}`,
    ]);
    expect(s.legacyTenants.get(tenantId)).toBe(s.repository.tenants.get(tenantId)?.demoPassword);
    expect(s.accounts.get("visitor@example.org")).toEqual({ tenantId, suppressMail: false });
    expect(s.schedules.get(tenantId)).toEqual({
      passId,
      at: new Date("2026-10-02T12:00:00.000Z"),
    });
    // 24 hours after redeeming, if the holder has not signed in by then.
    expect(s.reminders.get(tenantId)).toEqual({
      passId,
      at: new Date("2026-10-01T12:00:00.000Z"),
    });
    expect(s.repository.tenants.get(tenantId)?.status).toBe("active");
    expect(s.repository.passes.get(passId)?.status).toBe("active");
    const provisioned = TenantProvisioned.detail.parse(s.published.at(-1)?.detail);
    expect(provisioned.payload).toEqual({ passId, tenantId, tableName: table, durationMs: 20_000 });

    expect(s.hints).toEqual([
      {
        subject: "Demo-Pass eingelöst",
        message:
          `Demo-Pass eingelöst: visitor@example.org, Mandant ${tenantId}, ` +
          "gültig bis 02.10.2026, 14:00 (Europe/Berlin).",
      },
    ]);

    // A redelivered event does nothing.
    await s.worker(event);
    expect(s.calls).toHaveLength(5);
    expect(s.types().filter((type) => type === "TenantProvisioned")).toHaveLength(1);
    expect(s.hints).toHaveLength(1);
  });

  it("tells the owner about the end without secrets, and survives a failing hint", async () => {
    const s = setup();
    const { tenantId, passId } = await activePass(s);
    await endPass(s.ctx, tenantId, passId, "expired", "test");
    await s.worker(expiredEvent(s));
    const ended = s.hints.at(-1);
    expect(ended).toEqual({
      subject: "Demo-Pass beendet",
      message: `Demo-Pass beendet (abgelaufen): visitor@example.org, Mandant ${tenantId} gelöscht, 1 Konto, 0 Uploads.`,
    });
    const password = s.repository.tenants.get(tenantId)?.demoPassword ?? "unset";
    expect(JSON.stringify(s.hints)).not.toContain(password);

    const failing = setup();
    failing.ctx.ownerHints.send = async () => {
      throw new Error("SNS down");
    };
    const pass = await activePass(failing, "b@example.org");
    expect(failing.repository.tenants.get(pass.tenantId)?.status).toBe("active");
  });

  it("creates short-lived holders without the Cognito mail", async () => {
    const s = setup();
    const passes = new Passes(s.ctx);
    const { link } = await passes.invite(
      { tenantId: "owner", subject: "o" },
      { email: "e2e@example.org", validMinutes: 5 },
      "corr",
    );
    await passes.redeem(link.split("#")[1] ?? "", "corr");
    await s.worker({
      source: "kundenportal.tenancy",
      "detail-type": "DemoPassIssued",
      detail: s.published.at(-1)?.detail,
    });
    expect(s.accounts.get("e2e@example.org")?.suppressMail).toBe(true);
    // No mail, nothing to remind of.
    expect(s.reminders.size).toBe(0);
  });

  it("stops when the pass ended during the setup", async () => {
    const s = setup();
    const { tenantId, event } = await issuedPass(s);
    s.ctx.tables.create = async () => {
      await s.repository.setTenantStatus(tenantId, "tearing-down", s.ctx.now());
    };
    await s.worker(event);
    expect(s.calls).toEqual([]);
    expect(s.types()).not.toContain("TenantProvisioned");
  });
});

describe("expiry and teardown", () => {
  it("expires by schedule and tears everything down once", async () => {
    const s = setup();
    const { tenantId, passId } = await activePass(s);
    s.uploads.set(tenantId, 2);
    s.calls.length = 0;

    s.advance(48 * HOUR);
    await s.worker({ task: "expire", tenantId, passId });
    expect(s.published.at(-1)).toMatchObject({
      detailType: "DemoPassExpired",
      detail: { payload: { reason: "expired" } },
    });
    expect(s.repository.tenants.get(tenantId)?.status).toBe("tearing-down");

    const event = expiredEvent(s);
    await s.worker(event);
    expect(s.calls).toEqual([
      `account:delete:${tenantId}`,
      `legacy:remove:${tenantId}`,
      `uploads:delete:${tenantId}`,
      `table:delete:kp-tenant-${tenantId}`,
      `schedule:delete:${tenantId}`,
    ]);
    expect(s.tables.size).toBe(0);
    expect(s.accounts.size).toBe(0);
    const tenant = s.repository.tenants.get(tenantId);
    expect(tenant?.status).toBe("deleted");
    expect(tenant?.ttl).toBe(Math.floor(Date.parse("2026-11-01T12:00:00.000Z") / 1000));
    expect(s.repository.passes.get(passId)).toMatchObject({
      status: "deleted",
      endReason: "expired",
      ttl: tenant?.ttl,
    });
    expect(TenantDeleted.detail.parse(s.published.at(-1)?.detail).payload).toEqual({
      passId,
      tenantId,
      deletedAccounts: 1,
    });

    expect(s.repository.settings.activeTenants).toBe(0);

    // Redelivery and a late schedule are harmless.
    await s.worker(event);
    await s.worker({ task: "expire", tenantId, passId });
    expect(s.types().filter((type) => type === "TenantDeleted")).toHaveLength(1);
    expect(s.types().filter((type) => type === "DemoPassExpired")).toHaveLength(1);
    expect(s.hints.filter((hint) => hint.subject === "Demo-Pass beendet")).toHaveLength(1);
  });

  it("frees exactly one place of the cap per tenant, however often it is torn down", async () => {
    const s = setup();
    const first = await activePass(s, "a@example.org");
    await activePass(s, "b@example.org");
    expect(s.repository.settings.activeTenants).toBe(2);
    await Promise.all([
      teardownTenant(s.ctx, first.tenantId),
      teardownTenant(s.ctx, first.tenantId),
      teardownTenant(s.ctx, first.tenantId),
    ]);
    expect(s.repository.settings.activeTenants).toBe(1);
    // A counter that drifted to 0 stays at 0 instead of going negative.
    s.repository.settings.activeTenants = 0;
    await teardownAllTenants(s.ctx);
    expect(s.repository.settings.activeTenants).toBe(0);
  });

  it("tears down orphans that have no platform items", async () => {
    const s = setup();
    s.tables.add("kp-tenant-pabcdefg");
    const result = await teardownTenant(s.ctx, "pabcdefg");
    expect(result).toEqual({ tenantId: "pabcdefg", deletedAccounts: 0, deletedUploads: 0 });
    expect(s.tables.size).toBe(0);
    expect(s.published).toEqual([]);
  });
});

describe("reconcile", () => {
  it("expires overdue passes, re-drives stuck setups and removes orphaned tables", async () => {
    const s = setup();
    const overdue = await activePass(s, "a@example.org");
    const stuck = await issuedPass(s, "b@example.org");
    s.tables.add("kp-tenant-porphan2");
    s.tables.add("kp-other-table");

    s.advance(48 * HOUR + MINUTE);
    const result = await s.worker({ task: "reconcile" });
    expect(result).toEqual({
      expired: [overdue.tenantId, stuck.tenantId].sort(),
      reprovisioned: [],
      tornDown: ["porphan2"],
      reminded: [],
      // Both only expired so far (tearing-down): they still hold their place.
      activeTenants: 2,
    });
    expect(s.tables.has("kp-tenant-porphan2")).toBe(false);
  });

  it("recomputes a drifted counter of active tenants from the tenant items", async () => {
    const s = setup();
    await activePass(s, "a@example.org");
    await activePass(s, "b@example.org");
    s.repository.settings.activeTenants = 3;
    expect(await s.worker({ task: "reconcile" })).toMatchObject({ activeTenants: 2 });
    expect(s.repository.settings.activeTenants).toBe(2);
    delete s.repository.settings.activeTenants;
    await s.worker({ task: "reconcile" });
    expect(s.repository.settings.activeTenants).toBe(2);
  });

  it("re-drives a setup that hangs for more than ten minutes", async () => {
    const s = setup();
    const { tenantId } = await issuedPass(s);
    s.advance(11 * MINUTE);
    const result = await s.worker({ task: "reconcile" });
    expect(result).toMatchObject({ reprovisioned: [tenantId] });
    expect(s.repository.tenants.get(tenantId)?.status).toBe("active");
  });

  it("finishes a teardown that hangs for more than ten minutes", async () => {
    const s = setup();
    const { tenantId, passId } = await activePass(s);
    await endPass(s.ctx, tenantId, passId, "expired", "test");
    s.advance(11 * MINUTE);
    const result = await s.worker({ task: "reconcile" });
    expect(result).toMatchObject({ tornDown: [tenantId] });
    expect(s.repository.tenants.get(tenantId)?.status).toBe("deleted");
  });
});

describe("reminder", () => {
  it("sends the invitation once more to a holder who has not signed in", async () => {
    const s = setup();
    const { tenantId, passId } = await activePass(s);
    s.advance(24 * HOUR);
    await s.worker({ task: "remind", tenantId, passId });
    expect(s.calls.at(-1)).toBe("account:resend:visitor@example.org");
    expect(s.accounts.get("visitor@example.org")?.invitations).toBe(2);
    expect(s.repository.tenants.get(tenantId)?.reminderSentAt).toBe(s.ctx.now().toISOString());
    expect(s.hints.at(-1)).toEqual({
      subject: "Demo-Pass: Erinnerung verschickt",
      message: `Erinnerung an visitor@example.org verschickt: Mandant ${tenantId}, seit 24 Stunden nicht angemeldet.`,
    });
    // At most once: neither the schedule again nor the reconcile sends a second one.
    await s.worker({ task: "remind", tenantId, passId });
    expect(await s.worker({ task: "reconcile" })).toMatchObject({ reminded: [] });
    expect(s.calls.filter((call) => call.startsWith("account:resend"))).toHaveLength(1);
  });

  it("does nothing once the holder signed in or the pass ended", async () => {
    const s = setup();
    const signedIn = await activePass(s, "a@example.org");
    const account = s.accounts.get("a@example.org");
    if (account) account.status = "CONFIRMED";
    const ended = await activePass(s, "b@example.org");
    await endPass(s.ctx, ended.tenantId, ended.passId, "expired", "test");
    s.advance(24 * HOUR);
    await s.worker({ task: "remind", tenantId: signedIn.tenantId, passId: signedIn.passId });
    await s.worker({ task: "remind", tenantId: ended.tenantId, passId: ended.passId });
    expect(s.calls.filter((call) => call.startsWith("account:resend"))).toEqual([]);
    expect(s.repository.tenants.get(signedIn.tenantId)?.reminderSentAt).toBeUndefined();
  });

  it("frees the claim when Cognito fails, so a later run can send it", async () => {
    const s = setup();
    const { tenantId, passId } = await activePass(s);
    s.advance(24 * HOUR);
    s.ctx.accounts.resendInvitation = async () => {
      throw new Error("Cognito down");
    };
    await expect(s.worker({ task: "remind", tenantId, passId })).rejects.toThrow("Cognito down");
    expect(s.repository.tenants.get(tenantId)?.reminderSentAt).toBeUndefined();
  });

  it("is sent by the reconcile when no schedule did (paused stack)", async () => {
    const s = setup();
    const { tenantId } = await activePass(s);
    s.advance(23 * HOUR);
    expect(await s.worker({ task: "reconcile" })).toMatchObject({ reminded: [] });
    s.advance(2 * HOUR);
    expect(await s.worker({ task: "reconcile" })).toMatchObject({ reminded: [tenantId] });
    expect(s.accounts.get("visitor@example.org")?.invitations).toBe(2);
  });

  it("is not scheduled when it would come after the end of the pass", async () => {
    const s = testContext();
    s.ctx.config = { ...s.ctx.config, passHours: 24, reminderHours: 24 };
    const worker = createWorker(s.ctx);
    const { tenantId, event } = await issuedPass(s);
    await worker(event);
    expect(s.schedules.has(tenantId)).toBe(true);
    expect(s.reminders.size).toBe(0);
  });

  it("goes with the teardown", async () => {
    const s = setup();
    const { tenantId } = await activePass(s);
    expect(s.reminders.has(tenantId)).toBe(true);
    await teardownTenant(s.ctx, tenantId);
    expect(s.reminders.size).toBe(0);
  });
});

describe("activation by the first sign-in", () => {
  it("moves the end to 48 hours from the sign-in, once", async () => {
    const s = setup();
    const { tenantId, passId } = await activePass(s);
    s.advance(30 * HOUR);
    expect(await activatePass(s.ctx, tenantId)).toBe(true);
    const until = new Date(s.ctx.now().getTime() + 48 * HOUR).toISOString();
    expect(s.repository.tenants.get(tenantId)).toMatchObject({
      activatedAt: s.ctx.now().toISOString(),
      validUntil: until,
    });
    expect(s.repository.passes.get(passId)?.validUntil).toBe(until);

    s.advance(HOUR);
    expect(await activatePass(s.ctx, tenantId)).toBe(false);
    expect(s.repository.tenants.get(tenantId)?.validUntil).toBe(until);

    // The first schedule fires at the old end and is followed by one at the new end.
    s.advance(17 * HOUR);
    await s.worker({ task: "expire", tenantId, passId });
    expect(s.repository.tenants.get(tenantId)?.status).toBe("active");
    expect(s.calls.at(-1)).toBe(`schedule:move:${tenantId}`);
    expect(s.schedules.get(tenantId)?.at.toISOString()).toBe(until);
    // A pending reminder skips an activated pass.
    await s.worker({ task: "remind", tenantId, passId });
    expect(s.calls.filter((call) => call.startsWith("account:resend"))).toEqual([]);

    s.advance(30 * HOUR);
    await s.worker({ task: "expire", tenantId, passId });
    expect(s.repository.tenants.get(tenantId)?.status).toBe("tearing-down");
  });

  it("keeps the minutes of short test passes and ignores ended passes", async () => {
    const s = setup();
    const passes = new Passes(s.ctx);
    const { link } = await passes.invite(
      { tenantId: "owner", subject: "o" },
      { email: "e2e@example.org", validMinutes: 5 },
      "corr",
    );
    await passes.redeem(link.split("#")[1] ?? "", "corr");
    const { tenantId } = DemoPassIssued.detail.parse(s.published.at(-1)?.detail).payload;
    const before = s.repository.tenants.get(tenantId)?.validUntil;
    expect(await activatePass(s.ctx, tenantId)).toBe(true);
    expect(s.repository.tenants.get(tenantId)?.validUntil).toBe(before);
    expect(s.repository.tenants.get(tenantId)?.activatedAt).toBeDefined();

    const ended = await activePass(s, "b@example.org");
    await endPass(s.ctx, ended.tenantId, ended.passId, "expired", "test");
    expect(await activatePass(s.ctx, ended.tenantId)).toBe(false);
    expect(await activatePass(s.ctx, "pzzzzzzz")).toBe(false);
  });
});

describe("teardown of all tenants", () => {
  it("removes live tenants and orphaned tables (stack deletion)", async () => {
    const s = setup();
    const live = await activePass(s);
    s.tables.add("kp-tenant-porphan2");
    const cleanup = createCleanup(s.ctx);
    expect(await cleanup({ RequestType: "Create" })).toEqual({
      PhysicalResourceId: "kundenportal-pass-tenants",
    });
    expect(s.tables.size).toBe(2);
    await cleanup({ RequestType: "Delete", PhysicalResourceId: "kundenportal-pass-tenants" });
    expect(s.tables.size).toBe(0);
    expect(s.repository.tenants.get(live.tenantId)?.status).toBe("deleted");
    expect(await teardownAllTenants(s.ctx)).toEqual([]);
  });
});

describe("quota and kill switch", () => {
  const event = (tenantId: string, source = "kundenportal.customer") => ({
    source,
    "detail-type": "Something",
    detail: { tenantId, correlationId: "c" },
  });

  it("counts events of pass tenants and flags the first one over the limit", async () => {
    const s = setup();
    const { tenantId, passId } = await activePass(s);
    for (let i = 0; i < 3; i++) await s.worker(event(tenantId));
    expect(s.repository.tenants.get(tenantId)?.status).toBe("active");
    await s.worker(event(tenantId));
    await s.worker(event(tenantId));
    expect(s.repository.tenants.get(tenantId)?.status).toBe("quota-exceeded");
    expect(s.published.filter((p) => p.detailType === "QuotaExceeded")).toEqual([
      expect.objectContaining({
        detail: expect.objectContaining({
          payload: { passId, tenantId, kind: "events", limit: 3 },
        }),
      }),
    ]);
  });

  it("ignores own lifecycle events, the owner tenant and unknown tenants", async () => {
    const s = setup();
    const { tenantId } = await activePass(s);
    await s.worker(event(tenantId, "kundenportal.tenancy"));
    await s.worker(event("owner"));
    await s.worker(event("pzzzzzzz"));
    expect(await s.repository.getQuotaUsage(tenantId)).toEqual({ api: 0, events: 0, uploads: 0 });
    expect(s.repository.usage.size).toBe(0);
  });

  it("closes redemption on a budget alarm", async () => {
    const s = setup();
    await s.worker({
      Records: [{ EventSource: "aws:sns", Sns: { Message: "Budget exceeded", TopicArn: "arn" } }],
    });
    expect(await s.repository.getSettings()).toMatchObject({
      redemption: "closed",
      closedReason: "Budget alarm: Budget exceeded",
    });
  });

  it("rejects input it does not understand", async () => {
    const s = setup();
    await expect(s.worker({ hello: "world" })).rejects.toThrow(/neither/);
    await expect(
      s.worker({ source: "kundenportal.tenancy", "detail-type": "DemoPassIssued", detail: {} }),
    ).rejects.toThrow(/Invalid DemoPassIssued/);
  });
});
