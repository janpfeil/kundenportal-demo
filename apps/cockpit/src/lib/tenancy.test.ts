import type { Session } from "@kundenportal/web-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listPasses } from "./tenancy";

const session = { accessToken: "token" } as Session;

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://portal.example.org");
  vi.stubEnv("API_URL", "https://api.example.org/api");
  vi.stubEnv("OIDC_CLIENT_ID", "client");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("listPasses", () => {
  it("reads the contract's passes and quota into the page's view", async () => {
    const body = {
      passes: [
        {
          passId: "pass-1",
          tenantId: "p4k7x2qa",
          email: "gast@example.org",
          status: "active",
          validUntil: "2026-10-07T12:00:00Z",
          quota: { api: { used: 2, limit: 5000 } },
        },
        { passId: "pass-2", tenantId: "pbbbbbbb", email: "x@example.org", status: "deleted" },
      ],
    };
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(body), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);
    const passes = await listPasses(session);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.example.org/api/tenancy/passes");
    expect(passes).toMatchObject([
      { passId: "pass-1", quotas: { api: { used: 2, limit: 5000 } } },
      { passId: "pass-2", status: "deleted", quotas: {} },
    ]);
  });

  it("gives up on an error answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    expect(await listPasses(session)).toBeUndefined();
  });
});
