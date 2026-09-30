import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { sub: "s", accessToken: "t", expiresAt: Date.now() + 60_000 };
const readSession = vi.fn();
const patch = vi.fn();

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./session", () => ({ readSession: () => readSession() }));
vi.mock("./api", () => ({ api: async () => ({ PATCH: patch }) }));
vi.mock("./config", () => ({
  config: () => ({ appUrl: new URL("https://kundenportal-demo.rypox.com") }),
}));

const { PATCH: patchProfile } = await import("../app/konto/profil/route");
const { POST: markRead } = await import("../app/postfach/[notificationId]/gelesen/route");

const request = (origin: string | undefined, body?: unknown) =>
  new Request("https://kundenportal-demo.rypox.com/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const params = { params: Promise.resolve({ notificationId: "n-1" }) };

beforeEach(() => {
  readSession.mockReset().mockResolvedValue(session);
  patch.mockReset().mockResolvedValue({ data: { customerId: "c" }, response: { status: 200 } });
});

describe("write routes", () => {
  it("refuse requests from another origin or without Origin (CSRF)", async () => {
    expect((await patchProfile(request("https://evil.example", {}))).status).toBe(403);
    expect((await markRead(request(undefined), params)).status).toBe(403);
    expect(patch).not.toHaveBeenCalled();
  });

  it("refuse requests without session", async () => {
    readSession.mockResolvedValue(undefined);
    expect((await patchProfile(request("https://kundenportal-demo.rypox.com", {}))).status).toBe(
      401,
    );
  });

  it("pass only known profile fields to PATCH /me", async () => {
    const response = await patchProfile(
      request("https://kundenportal-demo.rypox.com", {
        displayName: " Anna ",
        locale: "en",
        email: "x@y",
      }),
    );
    expect(response.status).toBe(200);
    expect(patch).toHaveBeenCalledWith("/me", { body: { displayName: "Anna", locale: "en" } });
  });

  it("marks a message as read", async () => {
    patch.mockResolvedValue({ response: { status: 204 } });
    const response = await markRead(request("https://kundenportal-demo.rypox.com", {}), params);
    expect(response.status).toBe(204);
    expect(patch).toHaveBeenCalledWith("/notifications/{notificationId}", {
      params: { path: { notificationId: "n-1" } },
      body: { read: true },
    });
  });
});
