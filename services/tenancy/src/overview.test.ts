import { DemoPassIssued } from "@kundenportal/events";
import { apiEvent } from "@kundenportal/service-kit/testing";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { describe, expect, it } from "vitest";
import { Altcha } from "./altcha.js";
import { createApi, createPublicApi } from "./api.js";
import type { PlatformTenant } from "./model.js";
import { Passes } from "./passes.js";
import { PlatformSettings } from "./settings.js";
import { CONFIG, testContext } from "./testing.js";

const OWNER = { sub: "owner-sub", "cognito:groups": "[owner]" };
const EASY = { cost: 10, maxCounter: 20, expiresInMs: 600_000 };
const HOUR = 3_600_000;

function setup() {
  const t = testContext();
  const passes = new Passes(t.ctx);
  const altcha = new Altcha(async () => "test-hmac-key", EASY);
  return {
    ...t,
    passes,
    api: createApi(passes, new PlatformSettings(t.repository, CONFIG, t.ctx.now)),
    publicApi: createPublicApi(passes, altcha, t.repository, CONFIG, t.ctx.now),
    altcha,
  };
}
type Setup = ReturnType<typeof setup>;

const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "{}");

async function invite(s: Setup, email: string, extra: object = {}) {
  const result = await s.api(
    apiEvent("POST /tenancy/invitations", { claims: OWNER, body: { email, ...extra } }),
  );
  expect(result.statusCode).toBe(201);
  return (body(result) as { link: string }).link.split("#")[1] ?? "";
}

async function redeem(s: Setup, token: string) {
  const challenge = await s.altcha.challenge();
  const solution = await solveChallenge({ challenge, deriveKey });
  const altcha = Buffer.from(JSON.stringify({ challenge, solution })).toString("base64");
  const result = await s.publicApi(apiEvent("POST /tenancy/redeem", { body: { token, altcha } }));
  expect(result.statusCode).toBe(202);
  return DemoPassIssued.detail.parse(s.published.at(-1)?.detail).payload;
}

const overview = async (s: Setup) =>
  body(await s.api(apiEvent("GET /tenancy/overview", { claims: OWNER })));

describe("pass overview", () => {
  it("is for the owner only", async () => {
    const s = setup();
    expect((await s.api(apiEvent("GET /tenancy/overview"))).statusCode).toBe(403);
    const holder = { sub: "h", tenant_id: "p4k7x2qa", "cognito:groups": "[pass]" };
    expect((await s.api(apiEvent("GET /tenancy/overview", { claims: holder }))).statusCode).toBe(
      403,
    );
  });

  it("starts empty with seven German days of API calls", async () => {
    const s = setup();
    expect(await overview(s)).toEqual({
      activeTenants: 0,
      maxTenants: 3,
      openInvitations: 0,
      neverSignedIn: 0,
      reminderHours: 24,
      invitationDays: 14,
      invitations: [],
      apiCalls: {
        today: 0,
        days: [
          { date: "2026-09-24", calls: 0 },
          { date: "2026-09-25", calls: 0 },
          { date: "2026-09-26", calls: 0 },
          { date: "2026-09-27", calls: 0 },
          { date: "2026-09-28", calls: 0 },
          { date: "2026-09-29", calls: 0 },
          { date: "2026-09-30", calls: 0 },
        ],
      },
    });
  });

  it("lists open invitations newest first, without redeemed or expired ones", async () => {
    const s = setup();
    await invite(s, "first@example.org");
    s.advance(HOUR);
    const redeemed = await invite(s, "second@example.org");
    s.advance(HOUR);
    await invite(s, "Third@Example.org", { validMinutes: 30 });
    await redeem(s, redeemed);

    const result = await overview(s);
    expect(result.openInvitations).toBe(2);
    expect(result.invitations).toEqual([
      {
        invitationId: "id-3",
        email: "third@example.org",
        createdAt: "2026-09-30T14:00:00.000Z",
        expiresAt: "2026-10-14T14:00:00.000Z",
        shortLived: true,
      },
      {
        invitationId: "id-1",
        email: "first@example.org",
        createdAt: "2026-09-30T12:00:00.000Z",
        expiresAt: "2026-10-14T12:00:00.000Z",
        shortLived: false,
      },
    ]);
    // The index entry carries no token and no hash.
    expect(JSON.stringify([...s.repository.invitationIndex.values()])).not.toMatch(/token|hash/i);

    // After 14 days the first one has expired.
    s.advance(14 * 24 * HOUR - HOUR);
    expect((await overview(s)).invitations.map((i: { email: string }) => i.email)).toEqual([
      "third@example.org",
    ]);
  });

  it("counts active passes whose holder never signed in", async () => {
    const s = setup();
    const set = (tenantId: string, fields: Partial<PlatformTenant>) =>
      Object.assign(s.repository.tenants.get(tenantId) ?? {}, fields);
    const a = await redeem(s, await invite(s, "a@example.org"));
    const b = await redeem(s, await invite(s, "b@example.org"));
    const c = await redeem(s, await invite(s, "c@example.org"));
    set(a.tenantId, { status: "active" });
    set(b.tenantId, { status: "active", activatedAt: "2026-09-30T12:30:00.000Z" });
    // Still being set up: the holder has no account yet.
    set(c.tenantId, { status: "provisioning" });

    const result = await overview(s);
    expect(result.neverSignedIn).toBe(1);
    expect(result).toMatchObject({ activeTenants: 3, maxTenants: 3 });
  });

  it("sums the API calls of the tenants that still have counters, per German day", async () => {
    const s = setup();
    const a = await redeem(s, await invite(s, "a@example.org"));
    const b = await redeem(s, await invite(s, "b@example.org"));
    const gone = await redeem(s, await invite(s, "gone@example.org"));
    const calls = (tenantId: string, date: string, count: number) =>
      s.repository.apiDays.set(`${tenantId}|${date}`, count);
    calls(a.tenantId, "2026-09-30", 12);
    calls(b.tenantId, "2026-09-30", 5);
    calls(a.tenantId, "2026-09-28", 3);
    // Older than seven days: not part of the course.
    calls(a.tenantId, "2026-09-23", 99);
    calls(gone.tenantId, "2026-09-30", 40);
    const deleted = s.repository.tenants.get(gone.tenantId);
    if (deleted) deleted.status = "deleted";

    const result = await overview(s);
    expect(result.apiCalls.today).toBe(17);
    expect(result.apiCalls.days.map((d: { calls: number }) => d.calls)).toEqual([
      0, 0, 0, 0, 3, 0, 17,
    ]);
  });

  it("moves to the next day at German midnight", async () => {
    const s = setup();
    // 2026-09-30T12:00Z + 10 h = 22:00 UTC = 00:00 on 1 October German time.
    s.advance(10 * HOUR);
    const { days } = (await overview(s)).apiCalls;
    expect(days.at(-1).date).toBe("2026-10-01");
    expect(days[0].date).toBe("2026-09-25");
  });
});
