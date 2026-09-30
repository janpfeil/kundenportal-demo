import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessOf, isRevocable, parseInvitation } from "@/lib/tenancy";

const readSession = vi.fn();

vi.mock("@kundenportal/web-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kundenportal/web-auth")>()),
  zoneConfig: () => ({
    appUrl: new URL("https://portal.example"),
    apiUrl: "https://api.example/api",
    clientId: "c",
  }),
  readSession: () => readSession(),
  apiFor: vi.fn(() => ({})),
}));

const { POST: invite } = await import("./invitations/route");
const { POST: revoke } = await import("./passes/[passId]/revoke/route");

const token = (payload: object) =>
  `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
const session = { sub: "s", accessToken: "token", expiresAt: Date.now() + 60_000 };
const fetchMock = vi.fn<typeof fetch>();
const request = (body: unknown, origin = "https://portal.example") =>
  new Request("https://function.example/cockpit/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
const params = (passId: string) => ({ params: Promise.resolve({ passId }) });

beforeEach(() => {
  vi.clearAllMocks();
  readSession.mockResolvedValue(session);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("pass administration routes", () => {
  it("create an invitation with the owner's token and pass the link back", async () => {
    const created = {
      invitationId: "i1",
      link: "https://portal.example/pass/einloesen#t",
      expiresAt: "x",
    };
    fetchMock.mockResolvedValue(Response.json(created, { status: 201 }));
    const response = await invite(request({ email: " gast@example.org ", validMinutes: 3 }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(created);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example/api/tenancy/invitations");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "gast@example.org", validMinutes: 3 });
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer token");
  });

  it("refuse invalid invitations, foreign origins and missing sessions", async () => {
    expect((await invite(request({ email: "kein-mail" }))).status).toBe(400);
    expect((await invite(request({ email: "a@b.de", validMinutes: 61 }))).status).toBe(400);
    expect((await invite(request({ email: "a@b.de" }, "https://evil.example"))).status).toBe(403);
    readSession.mockResolvedValue(undefined);
    expect((await invite(request({ email: "a@b.de" }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pass the API's 403 for non-owners through", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ title: "Forbidden", status: 403 }, { status: 403 }),
    );
    const response = await invite(request({ email: "a@b.de" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("problem+json");
  });

  it("revoke a pass by a well-formed id only", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect((await revoke(request({}), params("pass-1"))).status).toBe(204);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example/api/tenancy/passes/pass-1/revoke",
    );
    expect((await revoke(request({}), params("../x"))).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("pass helpers", () => {
  it("validate the invitation form", () => {
    expect(parseInvitation({ email: "gast@example.org" })).toEqual({ email: "gast@example.org" });
    expect(parseInvitation({ email: "gast@example.org", validMinutes: "" })).toEqual({
      email: "gast@example.org",
    });
    expect(parseInvitation({ email: "gast@example.org", validMinutes: 1.5 })).toBeUndefined();
    expect(parseInvitation({ email: "gast@example.org", validMinutes: 0 })).toBeUndefined();
    expect(parseInvitation({ email: "a b@example.org" })).toBeUndefined();
    expect(parseInvitation(null)).toBeUndefined();
  });

  it("derive cockpit access from the token's groups", () => {
    const withGroups = (groups: string[]) => ({
      ...session,
      accessToken: token({ "cognito:groups": groups }),
    });
    expect(accessOf(withGroups(["owner"]))).toBe("owner");
    expect(accessOf(withGroups(["pass"]))).toBe("pass");
    expect(accessOf(withGroups([]))).toBe("none");
    expect(accessOf(session)).toBe("none");
  });

  it("offer revocation only for running passes", () => {
    expect(isRevocable("active")).toBe(true);
    expect(isRevocable("provisioning")).toBe(true);
    expect(isRevocable("tearing-down")).toBe(false);
    expect(isRevocable("deleted")).toBe(false);
  });
});
