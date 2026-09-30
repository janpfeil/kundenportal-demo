import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ApiResult, writePath } from "./forward.js";
import type { Session } from "./session.js";

const session: Session = { sub: "s", accessToken: "token", expiresAt: Date.now() + 60_000 };
const readSession = vi.fn<() => Promise<Session | undefined>>();
const api = { marker: "api" };
const forward = writePath({
  readSession,
  appUrl: () => new URL("https://portal.example"),
  apiFor: () => api as never,
});

function request(body: string, origin: string | null = "https://portal.example") {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  return new Request("https://function.example/zone/api/x", { method: "POST", headers, body });
}

const answer = (status: number, payload?: unknown): ApiResult => ({
  ...(status < 400 ? { data: payload } : { error: payload }),
  response: new Response(null, { status }),
});

const accept = (body: unknown) => body as { value: number };

beforeEach(() => {
  vi.clearAllMocks();
  readSession.mockResolvedValue(session);
});

describe("write path", () => {
  it("rejects foreign or missing origins with 403 before reading the session", async () => {
    const call = vi.fn();
    for (const origin of ["https://evil.example", null]) {
      const response = await forward(request("{}", origin), accept, call);
      expect(response.status).toBe(403);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
    }
    expect(readSession).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("answers 401 without a session and 400 for invalid bodies", async () => {
    readSession.mockResolvedValueOnce(undefined);
    expect((await forward(request("{}"), accept, vi.fn())).status).toBe(401);
    expect((await forward(request("{kaputt"), accept, vi.fn())).status).toBe(400);
    expect((await forward(request("{}"), () => undefined, vi.fn())).status).toBe(400);
  });

  it("calls the API with client, body and session and passes the answer through", async () => {
    const call = vi.fn().mockResolvedValue(answer(201, { id: 1 }));
    const response = await forward(request('{"value":1}'), accept, call);
    expect(call).toHaveBeenCalledWith(api, { value: 1 }, session);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ id: 1 });
  });

  it("keeps the API's problem details and status", async () => {
    const problem = { title: "Conflict", status: 409, detail: "not yet" };
    const response = await forward(request("{}"), accept, async () => answer(409, problem));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(problem);
    const bare = await forward(request("{}"), accept, async () => answer(500));
    expect(await bare.json()).toMatchObject({ status: 500 });
  });

  it("answers 204 without a body and 502 when the API is unreachable", async () => {
    const empty = await forward(request("{}"), accept, async () => answer(204));
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe("");
    const failed = await forward(request("{}"), accept, async () => {
      throw new Error("down");
    });
    expect(failed.status).toBe(502);
  });
});
