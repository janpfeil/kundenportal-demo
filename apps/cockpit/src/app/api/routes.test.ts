import { beforeEach, describe, expect, it, vi } from "vitest";

const api = { POST: vi.fn() };
const readSession = vi.fn();

vi.mock("@kundenportal/web-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kundenportal/web-auth")>()),
  zoneConfig: () => ({
    appUrl: new URL("https://portal.example"),
    apiUrl: "https://api.example",
    clientId: "c",
  }),
  readSession: () => readSession(),
  apiFor: vi.fn(() => api),
}));

const { POST: bulk } = await import("./bulk/route");
const { POST: redrive } = await import("./dlq/[recordId]/redrive/route");

const session = { sub: "s", accessToken: "token", expiresAt: Date.now() + 60_000 };
const request = (body: unknown, origin = "https://portal.example") =>
  new Request("https://function.example/cockpit/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
const params = (recordId: string) => ({ params: Promise.resolve({ recordId }) });

beforeEach(() => {
  vi.clearAllMocks();
  readSession.mockResolvedValue(session);
  api.POST.mockResolvedValue({
    data: { runId: "r" },
    response: new Response(null, { status: 202 }),
  });
});

describe("cockpit routes", () => {
  it("start a bulk import for a known system only", async () => {
    expect((await bulk(request({ system: "telco" }))).status).toBe(202);
    expect(api.POST).toHaveBeenCalledWith("/migration/bulk", { body: { system: "telco" } });
    expect((await bulk(request({ system: "gas" }))).status).toBe(400);
  });

  it("pass the owner check's 403 through", async () => {
    api.POST.mockResolvedValue({
      error: { title: "Forbidden", status: 403 },
      response: new Response(null, { status: 403 }),
    });
    expect((await bulk(request({ system: "telco" }))).status).toBe(403);
  });

  it("redrive a record with validated corrections", async () => {
    const ok = await redrive(request({ corrections: { postalCode: "04229" } }), params("dGVsY28"));
    expect(ok.status).toBe(202);
    expect(api.POST).toHaveBeenCalledWith("/migration/dlq/{recordId}/redrive", {
      params: { path: { recordId: "dGVsY28" } },
      body: { corrections: { postalCode: "04229" } },
    });
    expect((await redrive(request({}), params("../x"))).status).toBe(400);
  });

  it("refuse foreign origins and missing sessions", async () => {
    expect((await bulk(request({ system: "telco" }, "https://evil.example"))).status).toBe(403);
    readSession.mockResolvedValue(undefined);
    expect((await bulk(request({ system: "telco" }))).status).toBe(401);
  });
});
