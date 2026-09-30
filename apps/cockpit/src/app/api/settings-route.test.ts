import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSettings, parseSettingsUpdate } from "@/lib/settings";

const readSession = vi.fn();

vi.mock("@kundenportal/web-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@kundenportal/web-auth")>();
  const mocked = {
    zoneConfig: () => ({
      appUrl: new URL("https://portal.example"),
      apiUrl: "https://api.example/api",
      clientId: "c",
    }),
    readSession: () => readSession(),
    apiFor: vi.fn((_session: unknown) => ({})),
  };
  // The shared write path, wired to the mocked session, configuration and API client.
  const forwardWrite = original.writePath({
    readSession: mocked.readSession,
    appUrl: () => mocked.zoneConfig().appUrl,
    apiFor: (session) => mocked.apiFor(session) as never,
  });
  return { ...original, ...mocked, forwardWrite };
});

const { PUT } = await import("./settings/route");

const session = { sub: "s", accessToken: "token", expiresAt: Date.now() + 60_000 };
const fetchMock = vi.fn<typeof fetch>();
const request = (body: unknown, origin = "https://portal.example") =>
  new Request("https://function.example/cockpit/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
const settings = { redemption: "open", maxTenants: 4, activeTenants: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  readSession.mockResolvedValue(session);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("PUT /cockpit/api/settings", () => {
  it("forwards a valid change with the owner's token and returns the new settings", async () => {
    fetchMock.mockResolvedValue(Response.json(settings));
    const response = await PUT(request({ redemption: "open", maxTenants: 4 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(settings);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example/api/tenancy/settings");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ redemption: "open", maxTenants: 4 });
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer token");
  });

  it("refuses foreign origins, missing sessions and invalid bodies before calling the API", async () => {
    expect((await PUT(request({ maxTenants: 2 }, "https://evil.example"))).status).toBe(403);
    readSession.mockResolvedValueOnce(undefined);
    expect((await PUT(request({ maxTenants: 2 }))).status).toBe(401);
    expect((await PUT(request({ maxTenants: 5 }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the API's 403 for non-owners through", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ title: "Forbidden", status: 403 }, { status: 403 }),
    );
    const response = await PUT(request({ redemption: "closed" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("problem+json");
  });
});

describe("settings shapes", () => {
  it("accepts only redemption open/closed and a cap of 1 to 4", () => {
    expect(parseSettingsUpdate({ redemption: "closed" })).toEqual({ redemption: "closed" });
    expect(parseSettingsUpdate({ maxTenants: 1 })).toEqual({ maxTenants: 1 });
    for (const body of [
      {},
      null,
      [],
      { maxTenants: 0 },
      { maxTenants: 5 },
      { maxTenants: 2.5 },
      { redemption: "paused" },
      { redemption: "open", activeTenants: 1 },
    ])
      expect(parseSettingsUpdate(body)).toBeUndefined();
  });

  it("reads the API's settings, with reason and time only while closed", () => {
    expect(parseSettings(settings)).toEqual(settings);
    expect(
      parseSettings({
        ...settings,
        redemption: "closed",
        closedAt: "2026-09-30T08:00:00.000Z",
        closedReason: "Budget alarm",
      }),
    ).toMatchObject({ closedReason: "Budget alarm", closedAt: "2026-09-30T08:00:00.000Z" });
    expect(parseSettings({ ...settings, redemption: "maybe" })).toBeUndefined();
    expect(parseSettings({ ...settings, maxTenants: "3" })).toBeUndefined();
  });
});
