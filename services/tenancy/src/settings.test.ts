import { apiEvent } from "@kundenportal/service-kit/testing";
import { describe, expect, it } from "vitest";
import { Altcha } from "./altcha.js";
import { createApi, createPublicApi } from "./api.js";
import { Passes } from "./passes.js";
import { PlatformSettings } from "./settings.js";
import { CONFIG, testContext } from "./testing.js";

const OWNER = { sub: "owner-sub", "cognito:groups": "[owner]" };
const PASS_HOLDER = { sub: "holder", tenant_id: "p4k7x2qa", "cognito:groups": "[pass]" };

function setup() {
  const t = testContext();
  const passes = new Passes(t.ctx);
  const altcha = new Altcha(async () => "test-hmac-key");
  return {
    ...t,
    api: createApi(passes, new PlatformSettings(t.repository, CONFIG, t.ctx.now)),
    publicApi: createPublicApi(passes, altcha, t.repository, CONFIG, t.ctx.now),
  };
}

const body = (result: { body?: string | undefined }) => JSON.parse(result.body ?? "{}");
const put = (
  s: ReturnType<typeof setup>,
  payload: unknown,
  claims: Record<string, string> = OWNER,
) => s.api(apiEvent("PUT /tenancy/settings", { claims, body: payload }));

describe("settings (owner)", () => {
  it("shows kill switch, cap and the counter of active tenants to the owner only", async () => {
    const s = setup();
    const denied = await s.api(apiEvent("GET /tenancy/settings", { claims: PASS_HOLDER }));
    expect(denied.statusCode).toBe(403);
    expect((await put(s, { maxTenants: 1 }, PASS_HOLDER)).statusCode).toBe(403);

    s.repository.settings.activeTenants = 2;
    const result = await s.api(apiEvent("GET /tenancy/settings", { claims: OWNER }));
    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({ redemption: "open", maxTenants: 3, activeTenants: 2 });
  });

  it("closes and reopens redemption; reopening clears when and why it was closed", async () => {
    const s = setup();
    await s.repository.closeRedemption(s.ctx.now(), "Budget alarm: 80 %");
    const closed = await s.api(apiEvent("GET /tenancy/settings", { claims: OWNER }));
    expect(body(closed)).toEqual({
      redemption: "closed",
      closedAt: "2026-09-30T12:00:00.000Z",
      closedReason: "Budget alarm: 80 %",
      maxTenants: 3,
      activeTenants: 0,
    });

    const reopened = await put(s, { redemption: "open", maxTenants: 4 });
    expect(reopened.statusCode).toBe(200);
    expect(body(reopened)).toEqual({ redemption: "open", maxTenants: 4, activeTenants: 0 });

    const ownerClosed = await put(s, { redemption: "closed" });
    expect(body(ownerClosed)).toMatchObject({
      redemption: "closed",
      closedAt: "2026-09-30T12:00:00.000Z",
      closedReason: "Vom Inhaber gesperrt",
    });
  });

  it("accepts a cap of 1 to 4 only (free DynamoDB capacity) and nothing unknown", async () => {
    const s = setup();
    for (const payload of [{ maxTenants: 0 }, { maxTenants: 5 }, { maxTenants: 2.5 }, {}]) {
      expect((await put(s, payload)).statusCode).toBe(400);
    }
    expect((await put(s, { redemption: "paused" })).statusCode).toBe(400);
    expect((await put(s, { maxTenants: 2, activeTenants: 0 })).statusCode).toBe(400);
    expect(body(await put(s, { maxTenants: 1 }))).toMatchObject({ maxTenants: 1 });
  });
});

describe("offer (public)", () => {
  it("serves the configured numbers, cacheable for a minute", async () => {
    const s = setup();
    const result = await s.publicApi(apiEvent("GET /tenancy/offer"));
    expect(result.statusCode).toBe(200);
    expect(result.headers?.["cache-control"]).toBe("public, max-age=60");
    expect(body(result)).toEqual({
      passHours: 48,
      quotas: { api: 5000, events: 3, uploads: 20 },
      uploadMaxBytes: 5 * 1024 * 1024,
      redemptionOpen: true,
    });
  });

  it("says redemption is not possible while closed or while every tenant is taken", async () => {
    const s = setup();
    s.repository.settings.activeTenants = 3;
    const full = await s.publicApi(apiEvent("GET /tenancy/offer"));
    expect(body(full).redemptionOpen).toBe(false);

    s.repository.settings.activeTenants = 1;
    await s.repository.closeRedemption(s.ctx.now(), "budget");
    const closed = await s.publicApi(apiEvent("GET /tenancy/offer"));
    expect(body(closed).redemptionOpen).toBe(false);
  });
});
