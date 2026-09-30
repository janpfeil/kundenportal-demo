import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redeemError, tokenFromHash } from "./redeem";
import { clientIp, daysLeft, fill, toPassLookup } from "./tenancy";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./config", () => ({
  config: () => ({
    appUrl: new URL("https://kundenportal-demo.rypox.com"),
    apiUrl: "https://api.example/api",
  }),
}));

const { POST: redeem } = await import("../app/pass/einloesen/api/route");
const { GET: challenge } = await import("../app/pass/einloesen/challenge/route");

const ORIGIN = "https://kundenportal-demo.rypox.com";
const TOKEN = "Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5";
const fetchMock = vi.fn<typeof fetch>();

const post = (body: unknown, headers: Record<string, string> = { origin: ORIGIN }) =>
  new Request(`${ORIGIN}/pass/einloesen/api`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("redeem route", () => {
  it("refuses other origins and malformed bodies without calling the API", async () => {
    expect((await redeem(post({ token: TOKEN, altcha: "x" }, {}))).status).toBe(403);
    expect(
      (await redeem(post({ token: TOKEN, altcha: "x" }, { origin: "https://evil.example" })))
        .status,
    ).toBe(403);
    expect((await redeem(post({ token: "short", altcha: "x" }))).status).toBe(400);
    expect((await redeem(post({ token: TOKEN }))).status).toBe(400);
    expect((await redeem(post({ token: `${TOKEN}/..`, altcha: "x" }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards token, ALTCHA payload and the viewer's IP", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ passId: "p1", statusUrl: "/pass" }, { status: 202 }),
    );
    const response = await redeem(
      post(
        { token: TOKEN, altcha: "payload", extra: "ignored" },
        { origin: ORIGIN, "cloudfront-viewer-address": "203.0.113.7:51234" },
      ),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ passId: "p1", statusUrl: "/pass" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example/api/tenancy/redeem");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ token: TOKEN, altcha: "payload" });
    expect((init?.headers as Record<string, string>)["x-kp-client-ip"]).toBe("203.0.113.7");
  });

  it("passes the API's problem details and status through", async () => {
    fetchMock.mockResolvedValue(Response.json({ title: "Gone", status: 410 }, { status: 410 }));
    const response = await redeem(post({ token: TOKEN, altcha: "payload" }));
    expect(response.status).toBe(410);
    expect(response.headers.get("content-type")).toContain("problem+json");
    expect(await response.json()).toEqual({ title: "Gone", status: 410 });
  });

  it("answers 502 when the API cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    expect((await redeem(post({ token: TOKEN, altcha: "payload" }))).status).toBe(502);
  });
});

describe("challenge route", () => {
  it("proxies the challenge uncached", async () => {
    fetchMock.mockResolvedValue(Response.json({ parameters: { nonce: "n" }, signature: "s" }));
    const response = await challenge();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example/api/tenancy/challenge");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ parameters: { nonce: "n" }, signature: "s" });
  });

  it("answers 503 when the API has no challenge", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    expect((await challenge()).status).toBe(503);
  });
});

describe("pass helpers", () => {
  it("reads the token only from a well-formed fragment", () => {
    expect(tokenFromHash(`#${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash("")).toBeUndefined();
    expect(tokenFromHash("#abc")).toBeUndefined();
    expect(tokenFromHash("#%E0%A4%A")).toBeUndefined();
  });

  it("maps every API status to a text", () => {
    expect([400, 404, 409, 410, 429, 503, 500, 0].map(redeemError)).toEqual([
      "invalid",
      "unknown",
      "used",
      "expired",
      "rateLimited",
      "closed",
      "failed",
      "failed",
    ]);
  });

  it("prefers CloudFront's viewer address over X-Forwarded-For", () => {
    expect(clientIp(new Headers({ "cloudfront-viewer-address": "2001:db8::1:443" }))).toBe(
      "2001:db8::1",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe(
      "198.51.100.2",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": "999.1.1.1" }))).toBeUndefined();
    expect(clientIp(new Headers())).toBeUndefined();
  });

  it("treats 404 and the owner tenant as 'no pass'", () => {
    expect(toPassLookup(404, undefined)).toEqual({ kind: "owner" });
    expect(toPassLookup(200, { tenantId: "owner" })).toEqual({ kind: "owner" });
    expect(toPassLookup(500, {})).toEqual({ kind: "error", status: 500 });
    expect(toPassLookup(200, { tenantId: "p1", status: "weird" })).toEqual({
      kind: "error",
      status: 502,
    });
    const lookup = toPassLookup(200, {
      tenantId: "p4k7x2qa",
      status: "active",
      validUntil: "2026-10-07T12:00:00Z",
      quotas: { api: { used: 1, limit: 5000 } },
      demoPassword: "pw",
    });
    expect(lookup).toMatchObject({
      kind: "pass",
      pass: { tenantId: "p4k7x2qa", demoPassword: "pw" },
    });
  });

  it("counts days left and fills placeholders", () => {
    const now = Date.parse("2026-09-30T12:00:00Z");
    expect(daysLeft("2026-10-07T12:00:00Z", now)).toBe(7);
    expect(daysLeft("2026-09-30T11:00:00Z", now)).toBe(0);
    expect(fill("{left} von {limit}", { left: 3, limit: 5 })).toBe("3 von 5");
  });
});
