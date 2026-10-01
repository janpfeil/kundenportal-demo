import { DemoPassIssued, InvitationCreated, PassTenantId } from "@kundenportal/events";
import { apiEvent } from "@kundenportal/service-kit/testing";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { describe, expect, it } from "vitest";
import { Altcha } from "./altcha.js";
import { CLIENT_IP_HEADER, createApi, createPublicApi, groupsOf } from "./api.js";
import { Passes, plusAddress } from "./passes.js";
import { sha256 } from "./secrets.js";
import { PlatformSettings } from "./settings.js";
import { CONFIG, testContext } from "./testing.js";

const OWNER = { sub: "owner-sub", "cognito:groups": "[owner]" };
const EASY = { cost: 10, maxCounter: 20, expiresInMs: 600_000 };

function setup() {
  const t = testContext();
  const passes = new Passes(t.ctx);
  const altcha = new Altcha(async () => "test-hmac-key", EASY);
  return {
    ...t,
    passes,
    altcha,
    api: createApi(passes, new PlatformSettings(t.repository, CONFIG, t.ctx.now)),
    publicApi: createPublicApi(passes, altcha, t.repository, CONFIG, t.ctx.now),
  };
}

type Setup = ReturnType<typeof setup>;

const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "{}");

async function solved(altcha: Altcha): Promise<string> {
  const challenge = await altcha.challenge();
  const solution = await solveChallenge({ challenge, deriveKey });
  return Buffer.from(JSON.stringify({ challenge, solution })).toString("base64");
}

async function invite(s: Setup, email = "visitor@example.org", extra: object = {}) {
  const result = await s.api(
    apiEvent("POST /tenancy/invitations", { claims: OWNER, body: { email, ...extra } }),
  );
  expect(result.statusCode).toBe(201);
  const { link } = body(result) as { link: string };
  return link.split("#")[1] ?? "";
}

async function redeem(s: Setup, token: string, headers: Record<string, string> = {}) {
  const event = apiEvent("POST /tenancy/redeem", {
    body: { token, altcha: await solved(s.altcha) },
  });
  event.headers = headers;
  return s.publicApi(event);
}

describe("invitations", () => {
  it("lets only the owner invite, stores the token's hash and never publishes the token", async () => {
    const s = setup();
    const denied = await s.api(
      apiEvent("POST /tenancy/invitations", { body: { email: "visitor@example.org" } }),
    );
    expect(denied.statusCode).toBe(403);

    const result = await s.api(
      apiEvent("POST /tenancy/invitations", {
        claims: OWNER,
        body: { email: "Visitor@Example.org" },
      }),
    );
    const response = body(result) as { invitationId: string; link: string; expiresAt: string };
    expect(response.link).toMatch(/^https:\/\/portal\.example\.org\/pass\/einloesen#[\w-]{43}$/);
    expect(response.expiresAt).toBe("2026-10-14T12:00:00.000Z");
    const token = response.link.split("#")[1] ?? "";
    expect([...s.repository.invitations.keys()]).toEqual([sha256(token)]);
    expect(s.repository.invitations.get(sha256(token))).toMatchObject({
      email: "visitor@example.org",
      createdBy: "owner-sub",
    });
    expect(s.types()).toEqual(["InvitationCreated"]);
    expect(InvitationCreated.detail.parse(s.published[0]?.detail).payload.email).toBe(
      "visitor@example.org",
    );
    expect(JSON.stringify(s.published)).not.toContain(token);
  });

  it("marks invitations with validMinutes as short-lived and rejects more than 60", async () => {
    const s = setup();
    const token = await invite(s, "e2e@example.org", { validMinutes: 5 });
    expect(s.repository.invitations.get(sha256(token))).toMatchObject({
      shortLived: true,
      validMinutes: 5,
    });
    const tooLong = await s.api(
      apiEvent("POST /tenancy/invitations", {
        claims: OWNER,
        body: { email: "e2e@example.org", validMinutes: 61 },
      }),
    );
    expect(tooLong.statusCode).toBe(400);
  });

  it("reads groups from array and bracket claims", () => {
    expect(groupsOf(apiEvent("GET /x", { claims: { "cognito:groups": "[owner pass]" } }))).toEqual([
      "owner",
      "pass",
    ]);
    expect(groupsOf(apiEvent("GET /x"))).toEqual([]);
  });
});

describe("redeem", () => {
  it("issues a pass once and publishes DemoPassIssued", async () => {
    const s = setup();
    const token = await invite(s);
    const result = await redeem(s, token);
    expect(result.statusCode).toBe(202);
    const { passId, statusUrl } = body(result) as { passId: string; statusUrl: string };
    expect(statusUrl).toBe("https://portal.example.org/pass");

    const issued = DemoPassIssued.detail.parse(s.published.at(-1)?.detail);
    expect(issued.payload).toMatchObject({ passId, email: "visitor@example.org" });
    expect(issued.payload.validUntil).toBe("2026-10-02T12:00:00.000Z");
    expect(PassTenantId.safeParse(issued.tenantId).success).toBe(true);
    const tenant = s.repository.tenants.get(issued.tenantId);
    expect(tenant).toMatchObject({
      status: "provisioning",
      tableName: `kp-tenant-${issued.tenantId}`,
    });
    expect(tenant?.demoPassword.length).toBeGreaterThanOrEqual(16);
    expect(JSON.stringify(s.published)).not.toContain(tenant?.demoPassword);

    const again = await redeem(s, token);
    expect(again.statusCode).toBe(409);
  });

  it("gives short-lived invitations minutes instead of days", async () => {
    const s = setup();
    await redeem(s, await invite(s, "e2e@example.org", { validMinutes: 5 }));
    const tenant = [...s.repository.tenants.values()][0];
    expect(tenant).toMatchObject({ validUntil: "2026-09-30T12:05:00.000Z", shortLived: true });
  });

  it("answers unknown, expired and malformed links", async () => {
    const s = setup();
    expect((await redeem(s, "A".repeat(43))).statusCode).toBe(404);
    const token = await invite(s);
    s.advance(15 * 86_400_000);
    expect((await redeem(s, token)).statusCode).toBe(410);
    const malformed = await s.publicApi(
      apiEvent("POST /tenancy/redeem", { body: { token: "short", altcha: "x" } }),
    );
    expect(malformed.statusCode).toBe(400);
  });

  it("rejects a missing, forged or replayed ALTCHA solution", async () => {
    const s = setup();
    const token = await invite(s);
    const forged = await s.publicApi(
      apiEvent("POST /tenancy/redeem", {
        body: { token, altcha: Buffer.from("{}").toString("base64") },
      }),
    );
    expect(forged.statusCode).toBe(400);

    const other = new Altcha(async () => "another-key", EASY);
    const foreign = await s.publicApi(
      apiEvent("POST /tenancy/redeem", { body: { token, altcha: await solved(other) } }),
    );
    expect(body(foreign).detail).toMatch(/not valid/);

    const payload = await solved(s.altcha);
    const first = await s.publicApi(
      apiEvent("POST /tenancy/redeem", { body: { token, altcha: payload } }),
    );
    expect(first.statusCode).toBe(202);
    const replay = await s.publicApi(
      apiEvent("POST /tenancy/redeem", {
        body: { token: await invite(s, "second@example.org"), altcha: payload },
      }),
    );
    expect(body(replay).detail).toMatch(/already used/);
  });

  it("limits attempts per client address and per source address", async () => {
    const s = setup();
    const token = "A".repeat(43);
    for (let i = 0; i < 10; i++) {
      expect((await redeem(s, token, { [CLIENT_IP_HEADER]: "203.0.113.7" })).statusCode).toBe(404);
    }
    expect((await redeem(s, token, { [CLIENT_IP_HEADER]: "203.0.113.7" })).statusCode).toBe(429);
    // Another visitor behind the same shell still gets through.
    expect((await redeem(s, token, { [CLIENT_IP_HEADER]: "203.0.113.8" })).statusCode).toBe(404);
    // A header that is no address counts for the source address.
    expect(s.repository.attempts.get(sha256("127.0.0.1"))).toBeUndefined();
    await redeem(s, token, { [CLIENT_IP_HEADER]: "not-an-ip" });
    expect(s.repository.attempts.get(sha256("127.0.0.1"))).toBe(1);
    expect(s.repository.attempts.get(sha256("source:127.0.0.1"))).toBe(12);
  });

  it("closes with the kill switch and at the tenant cap", async () => {
    const s = setup();
    for (const email of ["a@example.org", "b@example.org", "c@example.org"]) {
      expect((await redeem(s, await invite(s, email))).statusCode).toBe(202);
    }
    const capped = await redeem(s, await invite(s, "d@example.org"));
    expect(capped.statusCode).toBe(503);
    expect(body(capped).detail).toMatch(/in use/);

    expect(s.repository.settings.activeTenants).toBe(3);

    const first = [...s.repository.tenants.keys()][0] ?? "";
    await s.repository.markTenantDeleted(first, s.ctx.now(), s.ctx.now());
    expect(s.repository.settings.activeTenants).toBe(2);
    await s.repository.closeRedemption(s.ctx.now(), "budget");
    const closed = await redeem(s, await invite(s, "e@example.org"));
    expect(closed.statusCode).toBe(503);
    expect(body(closed).detail).toMatch(/paused/);
  });

  it("never exceeds the cap with simultaneous redeems (atomic counter)", async () => {
    const s = setup();
    s.repository.settings.maxTenants = 2;
    const tokens = await Promise.all(
      ["a@example.org", "b@example.org", "c@example.org", "d@example.org"].map((email) =>
        invite(s, email),
      ),
    );
    // The redeems interleave at every await, so several pass the fast check with the same
    // counter value; only the transaction's condition keeps the cap.
    const results = await Promise.all(tokens.map((token) => redeem(s, token)));
    const codes = results.map((result) => result.statusCode).sort();
    expect(codes).toEqual([202, 202, 503, 503]);
    expect(s.repository.tenants.size).toBe(2);
    expect(s.repository.settings.activeTenants).toBe(2);
    expect(s.types().filter((type) => type === "DemoPassIssued")).toHaveLength(2);
  });

  it("seeds a missing counter from the tenant items before the first redeem", async () => {
    const s = setup();
    await redeem(s, await invite(s, "a@example.org"));
    delete s.repository.settings.activeTenants;
    await redeem(s, await invite(s, "b@example.org"));
    expect(s.repository.settings.activeTenants).toBe(2);
  });

  it("allows one pass per address and none for existing portal accounts", async () => {
    const s = setup();
    await redeem(s, await invite(s, "visitor@example.org"));
    const second = await redeem(s, await invite(s, "visitor@example.org"));
    expect(second.statusCode).toBe(409);
    expect(body(second).detail).toMatch(/already has a demo pass/);

    s.accounts.set("anna@example.org", { tenantId: "owner", suppressMail: false });
    const existing = await redeem(s, await invite(s, "anna@example.org"));
    expect(body(existing).detail).toMatch(/portal account/);
  });

  it("serves a signed ALTCHA challenge that expires in ten minutes", async () => {
    const s = setup();
    const result = await s.publicApi(apiEvent("GET /tenancy/challenge"));
    const challenge = body(result) as {
      parameters: { algorithm: string; expiresAt: number };
      signature: string;
    };
    expect(challenge.parameters.algorithm).toBe("PBKDF2/SHA-256");
    expect(challenge.signature).toMatch(/^[0-9a-f]{64}$/);
    const inTenMinutes = Date.now() / 1000 + 600;
    expect(challenge.parameters.expiresAt).toBeGreaterThan(inTenMinutes - 2);
    expect(challenge.parameters.expiresAt).toBeLessThanOrEqual(inTenMinutes);
  });
});

describe("passes", () => {
  async function issued(s: Setup, email = "visitor@example.org") {
    await redeem(s, await invite(s, email));
    const detail = DemoPassIssued.detail.parse(s.published.at(-1)?.detail);
    return detail.payload;
  }

  it("shows the owner the holder's first sign-in and the tenant's last activity", async () => {
    const s = setup();
    const { tenantId } = await issued(s);
    const tenant = s.repository.tenants.get(tenantId);
    if (tenant) tenant.activatedAt = "2026-09-30T12:05:00.000Z";
    s.repository.lastActivity.set(tenantId, "2026-09-30T13:00:00.000Z");
    const result = await s.api(apiEvent("GET /tenancy/passes", { claims: OWNER }));
    expect(body(result).passes[0]).toMatchObject({
      activatedAt: "2026-09-30T12:05:00.000Z",
      lastActiveAt: "2026-09-30T13:00:00.000Z",
    });
  });

  it("lists passes with status and quota for the owner only", async () => {
    const s = setup();
    const { passId, tenantId } = await issued(s);
    await s.repository.addUsage(tenantId, "api");
    expect((await s.api(apiEvent("GET /tenancy/passes"))).statusCode).toBe(403);
    const result = await s.api(apiEvent("GET /tenancy/passes", { claims: OWNER }));
    expect(body(result).passes).toEqual([
      {
        passId,
        tenantId,
        email: "visitor@example.org",
        status: "provisioning",
        createdAt: "2026-09-30T12:00:00.000Z",
        validUntil: "2026-10-02T12:00:00.000Z",
        shortLived: false,
        quota: {
          api: { used: 1, limit: 5000 },
          events: { used: 0, limit: 3 },
          uploads: { used: 0, limit: 20 },
        },
      },
    ]);
  });

  it("revokes a pass once with DemoPassExpired (revoked)", async () => {
    const s = setup();
    const { passId, tenantId } = await issued(s);
    const revoke = (claims = OWNER) =>
      s.api(
        apiEvent("POST /tenancy/passes/{passId}/revoke", { claims, pathParameters: { passId } }),
      );
    expect((await revoke({ sub: "x", "cognito:groups": "[pass]" })).statusCode).toBe(403);
    expect((await revoke()).statusCode).toBe(202);
    expect(s.published.at(-1)).toMatchObject({
      detailType: "DemoPassExpired",
      detail: { tenantId, payload: { passId, tenantId, reason: "revoked" } },
    });
    expect(s.repository.passes.get(passId)).toMatchObject({ endReason: "revoked" });
    expect((await revoke()).statusCode).toBe(409);
    const unknown = await s.api(
      apiEvent("POST /tenancy/passes/{passId}/revoke", {
        claims: OWNER,
        pathParameters: { passId: "nope" },
      }),
    );
    expect(unknown.statusCode).toBe(404);
  });

  it("shows the own pass; the demo password only to the holder and the owner", async () => {
    const s = setup();
    const { tenantId } = await issued(s);
    const own = (claims: Record<string, string>) =>
      s.api(apiEvent("GET /tenancy/pass", { claims: { tenant_id: tenantId, ...claims } }));

    const holder = body(await own({ "cognito:groups": "[pass]" }));
    expect(holder).toMatchObject({ tenantId, status: "provisioning" });
    expect(holder.demoPassword).toBe(s.repository.tenants.get(tenantId)?.demoPassword);
    expect(holder.demoPersons).toContainEqual({
      name: "Anna Becker",
      system: "utility",
      signIn: `anna.becker+${tenantId}@example.org`,
    });
    expect(holder.demoPersons).toContainEqual({
      name: "Bernd Yilmaz",
      system: "telco",
      signIn: `b.yilmaz+${tenantId}@example.net`,
    });

    const person = body(await own({}));
    expect(person.quota.events).toEqual({ used: 0, limit: 3 });
    expect(person.demoPassword).toBeUndefined();

    const owner = body(await s.api(apiEvent("GET /tenancy/pass", { claims: OWNER })));
    expect(owner).toEqual({ tenantId: "owner", status: "owner" });
    const missing = await s.api(
      apiEvent("GET /tenancy/pass", { claims: { tenant_id: "pzzzzzzz" } }),
    );
    expect(missing.statusCode).toBe(404);
  });

  it("activates the holder's pass on the first sign-in, and nobody else's", async () => {
    const s = setup();
    const { tenantId } = await issued(s);
    await s.repository.setTenantStatus(tenantId, "active", s.ctx.now());
    const activate = (claims: Record<string, string>) =>
      s.api(
        apiEvent("POST /tenancy/pass/activate", { claims: { tenant_id: tenantId, ...claims } }),
      );

    expect((await activate({})).statusCode).toBe(204);
    expect(
      (await s.api(apiEvent("POST /tenancy/pass/activate", { claims: OWNER }))).statusCode,
    ).toBe(204);
    expect(s.repository.tenants.get(tenantId)?.activatedAt).toBeUndefined();

    s.advance(36 * 3_600_000);
    const first = await activate({ "cognito:groups": "[pass]" });
    expect(first.statusCode).toBe(200);
    expect(body(first)).toMatchObject({ tenantId, validUntil: "2026-10-04T00:00:00.000Z" });
    expect(body(first).demoPassword).toBeDefined();
    s.advance(3_600_000);
    const again = body(await activate({ "cognito:groups": "[pass]" }));
    expect(again.validUntil).toBe("2026-10-04T00:00:00.000Z");
  });

  it("builds plus addresses", () => {
    expect(plusAddress("anna.becker@example.org", "p4k7x2qa")).toBe(
      "anna.becker+p4k7x2qa@example.org",
    );
  });
});
