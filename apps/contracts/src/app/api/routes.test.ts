import { beforeEach, describe, expect, it, vi } from "vitest";

const api = { PATCH: vi.fn(), POST: vi.fn(), DELETE: vi.fn() };
const readSession = vi.fn();

vi.mock("@kundenportal/web-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@kundenportal/web-auth")>();
  const mocked = {
    zoneConfig: () => ({
      appUrl: new URL("https://portal.example"),
      apiUrl: "https://api.example",
      clientId: "c",
    }),
    readSession: () => readSession(),
    apiFor: vi.fn((_session: unknown) => api),
  };
  // The shared write path, wired to the mocked session, configuration and API client.
  const forwardWrite = original.writePath({
    readSession: mocked.readSession,
    appUrl: () => mocked.zoneConfig().appUrl,
    apiFor: (session) => mocked.apiFor(session) as never,
  });
  return { ...original, ...mocked, forwardWrite };
});

const { PATCH } = await import("./contracts/[contractId]/route");
const { POST } = await import("./documents/upload-url/route");
const order = await import("./contracts/route");
const termination = await import("./contracts/[contractId]/termination/route");
const cancel = await import("./contracts/[contractId]/termination/cancel/route");
const withdrawal = await import("./contracts/[contractId]/withdrawal/route");
const { apiFor } = await import("@kundenportal/web-auth");

const CONTRACT_ID = "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11";
const session = { sub: "s", accessToken: "token", expiresAt: Date.now() + 60_000 };

function request(method: string, body: unknown, origin: string | null = "https://portal.example") {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  return new Request("https://function.example/vertraege/api/x", {
    method,
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const patch = (body: unknown, origin?: string | null, id = CONTRACT_ID) =>
  PATCH(request("PATCH", body, origin), { params: Promise.resolve({ contractId: id }) });

const apiAnswer = (status: number, payload: unknown) => ({
  ...(status < 400 ? { data: payload } : { error: payload }),
  response: new Response(null, { status }),
});

beforeEach(() => {
  vi.clearAllMocks();
  readSession.mockResolvedValue(session);
});

describe("PATCH /vertraege/api/contracts/[contractId]", () => {
  it("rejects requests from another origin with 403", async () => {
    const response = await patch({ tariffOption: "oeko" }, "https://evil.example");
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(api.PATCH).not.toHaveBeenCalled();
  });

  it("rejects requests without Origin header with 403", async () => {
    expect((await patch({ tariffOption: "oeko" }, null)).status).toBe(403);
  });

  it("answers 401 without a session", async () => {
    readSession.mockResolvedValue(undefined);
    const response = await patch({ tariffOption: "oeko" });
    expect(response.status).toBe(401);
    expect(api.PATCH).not.toHaveBeenCalled();
  });

  it("forwards a valid update with the session's token and returns the contract", async () => {
    api.PATCH.mockResolvedValue(
      apiAnswer(200, { contractId: CONTRACT_ID, monthlyInstallmentCent: 9000 }),
    );
    const response = await patch({ monthlyInstallmentCent: 9000 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ monthlyInstallmentCent: 9000 });
    expect(apiFor).toHaveBeenCalledWith(session);
    expect(api.PATCH).toHaveBeenCalledWith("/contracts/{contractId}", {
      params: { path: { contractId: CONTRACT_ID } },
      body: { monthlyInstallmentCent: 9000 },
    });
  });

  it("passes the API's problem details and status through", async () => {
    const detail = "The installment must be between 60.00 and 120.00 EUR";
    api.PATCH.mockResolvedValue(
      apiAnswer(422, { title: "Unprocessable Content", status: 422, detail }),
    );
    const response = await patch({ monthlyInstallmentCent: 100 });
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toMatchObject({ detail });
  });

  it.each([
    ["invalid JSON", "{"],
    ["an empty update", {}],
    ["unknown fields", { tariffOption: "oeko", status: "terminated" }],
    ["a fractional amount", { monthlyInstallmentCent: 12.5 }],
  ])("answers 400 for %s", async (_case, body) => {
    expect((await patch(body)).status).toBe(400);
    expect(api.PATCH).not.toHaveBeenCalled();
  });

  it("answers 400 for a contract id that is no UUID", async () => {
    expect((await patch({ tariffOption: "oeko" }, undefined, "..%2Fme")).status).toBe(400);
  });

  it("answers 502 when the API cannot be reached", async () => {
    api.PATCH.mockRejectedValue(new TypeError("fetch failed"));
    expect((await patch({ tariffOption: "oeko" })).status).toBe(502);
  });
});

describe("POST /vertraege/api/documents/upload-url", () => {
  const announcement = {
    fileName: "rechnung.pdf",
    contentType: "application/pdf",
    sizeBytes: 1000,
    category: "other",
  };

  it("rejects requests from another origin with 403", async () => {
    expect((await POST(request("POST", announcement, "https://evil.example"))).status).toBe(403);
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("answers 401 without a session", async () => {
    readSession.mockResolvedValue(undefined);
    expect((await POST(request("POST", announcement))).status).toBe(401);
  });

  it("forwards the announcement and returns the upload ticket", async () => {
    const ticket = {
      documentId: "d",
      uploadUrl: "https://bucket.s3.eu-central-1.amazonaws.com/uploads/x",
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      expiresAt: "2026-09-30T12:05:00.000Z",
    };
    api.POST.mockResolvedValue(apiAnswer(201, ticket));
    const response = await POST(request("POST", announcement));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(ticket);
    expect(api.POST).toHaveBeenCalledWith("/documents/upload-url", { body: announcement });
  });

  it("rejects files the documents service would not sign", async () => {
    const gif = { ...announcement, contentType: "image/gif" };
    expect((await POST(request("POST", gif))).status).toBe(400);
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("passes a 409 (account being set up) through", async () => {
    api.POST.mockResolvedValue(apiAnswer(409, { title: "Conflict", status: 409 }));
    expect((await POST(request("POST", announcement))).status).toBe(409);
  });
});

describe("POST /vertraege/api/contracts (order)", () => {
  const body = {
    productId: "strom-oeko",
    optionId: "standard",
    startDate: "2026-10-02",
    meterNumber: "1EMH0012345678",
    startReading: 4711,
    consent: true,
  };

  it("rejects requests from another origin with 403", async () => {
    expect((await order.POST(request("POST", body, "https://evil.example"))).status).toBe(403);
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("forwards a valid order and returns the new contract with 201", async () => {
    api.POST.mockResolvedValue(apiAnswer(201, { contractId: CONTRACT_ID }));
    const response = await order.POST(request("POST", body));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ contractId: CONTRACT_ID });
    expect(api.POST).toHaveBeenCalledWith("/contracts", { body });
  });

  it("answers 400 without consent and does not call the API", async () => {
    expect((await order.POST(request("POST", { ...body, consent: false }))).status).toBe(400);
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("passes the API's 404 (product not orderable) through", async () => {
    api.POST.mockResolvedValue(apiAnswer(404, { title: "Not Found", status: 404 }));
    expect((await order.POST(request("POST", body))).status).toBe(404);
  });
});

describe("/vertraege/api/contracts/[contractId]/termination", () => {
  const context = (id = CONTRACT_ID) => ({ params: Promise.resolve({ contractId: id }) });

  it("gives notice with the chosen date", async () => {
    api.POST.mockResolvedValue(apiAnswer(200, { contractId: CONTRACT_ID }));
    const response = await termination.POST(
      request("POST", { effectiveDate: "2027-03-31" }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(api.POST).toHaveBeenCalledWith("/contracts/{contractId}/termination", {
      params: { path: { contractId: CONTRACT_ID } },
      body: { effectiveDate: "2027-03-31" },
    });
  });

  it("passes a blocked contract's 409 through", async () => {
    api.POST.mockResolvedValue(
      apiAnswer(409, { title: "Conflict", status: 409, detail: "The contract is blocked" }),
    );
    const response = await termination.POST(request("POST", {}), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ detail: "The contract is blocked" });
  });

  it("answers 400 for a malformed date or a contract id that is no UUID", async () => {
    const german = request("POST", { effectiveDate: "31.03.2027" });
    expect((await termination.POST(german, context())).status).toBe(400);
    expect((await termination.POST(request("POST", {}), context("x"))).status).toBe(400);
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("takes the notice back: the browser posts, the API gets DELETE", async () => {
    api.DELETE.mockResolvedValue(apiAnswer(200, { contractId: CONTRACT_ID }));
    const response = await cancel.POST(request("POST", {}), context());
    expect(response.status).toBe(200);
    expect(api.DELETE).toHaveBeenCalledWith("/contracts/{contractId}/termination", {
      params: { path: { contractId: CONTRACT_ID } },
    });
  });

  it("rejects taking the notice back from another origin", async () => {
    const foreign = request("POST", {}, "https://evil.example");
    expect((await cancel.POST(foreign, context())).status).toBe(403);
    expect(api.DELETE).not.toHaveBeenCalled();
  });
});

describe("POST /vertraege/api/contracts/[contractId]/withdrawal", () => {
  const context = () => ({ params: Promise.resolve({ contractId: CONTRACT_ID }) });

  it("withdraws through the API", async () => {
    api.POST.mockResolvedValue(apiAnswer(200, { contractId: CONTRACT_ID, status: "terminated" }));
    const response = await withdrawal.POST(request("POST", {}), context());
    expect(response.status).toBe(200);
    expect(api.POST).toHaveBeenCalledWith("/contracts/{contractId}/withdrawal", {
      params: { path: { contractId: CONTRACT_ID } },
    });
  });

  it("answers 400 for a body with fields and 401 without a session", async () => {
    expect((await withdrawal.POST(request("POST", { reason: "x" }), context())).status).toBe(400);
    readSession.mockResolvedValue(undefined);
    expect((await withdrawal.POST(request("POST", {}), context())).status).toBe(401);
    expect(api.POST).not.toHaveBeenCalled();
  });
});
