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

const readings = await import("./contracts/[contractId]/readings/route");
const upload = await import("./documents/upload-url/route");
const { apiFor } = await import("@kundenportal/web-auth");

const CONTRACT_ID = "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11";
const session = { sub: "s", accessToken: "token", expiresAt: Date.now() + 60_000 };

function request(body: unknown, origin: string | null = "https://portal.example") {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  return new Request("https://function.example/verbrauch/api/x", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const submit = (body: unknown, origin?: string | null, id = CONTRACT_ID) =>
  readings.POST(request(body, origin), { params: Promise.resolve({ contractId: id }) });

const apiAnswer = (status: number, payload: unknown) => ({
  ...(status < 400 ? { data: payload } : { error: payload }),
  response: new Response(null, { status }),
});

const reading = { value: 1234.5, readAt: "2026-09-30" };

beforeEach(() => {
  vi.clearAllMocks();
  readSession.mockResolvedValue(session);
});

describe("POST /verbrauch/api/contracts/[contractId]/readings", () => {
  it("rejects requests from another origin with 403", async () => {
    const response = await submit(reading, "https://evil.example");
    expect(response.status).toBe(403);
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("rejects requests without Origin header with 403", async () => {
    expect((await submit(reading, null)).status).toBe(403);
  });

  it("answers 401 without a session", async () => {
    readSession.mockResolvedValue(undefined);
    expect((await submit(reading)).status).toBe(401);
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("forwards the reading with the session's token and returns 201", async () => {
    const stored = {
      readingId: "r-1",
      ...reading,
      unit: "kWh",
      source: "customer",
      submittedAt: "x",
    };
    api.POST.mockResolvedValue(apiAnswer(201, stored));
    const response = await submit(reading);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(stored);
    expect(apiFor).toHaveBeenCalledWith(session);
    expect(api.POST).toHaveBeenCalledWith("/contracts/{contractId}/readings", {
      params: { path: { contractId: CONTRACT_ID } },
      body: reading,
    });
  });

  it("passes plausibility errors (422) through as problem details", async () => {
    const detail = "The value is below the latest reading of 2000";
    api.POST.mockResolvedValue(
      apiAnswer(422, { title: "Unprocessable Content", status: 422, detail }),
    );
    const response = await submit(reading);
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toMatchObject({ detail });
  });

  it("keeps the status when the API answers without a body", async () => {
    api.POST.mockResolvedValue({
      response: new Response(null, { status: 404, statusText: "Not Found" }),
    });
    const response = await submit(reading);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ title: "Not Found", status: 404 });
  });

  it.each([
    ["invalid JSON", "{"],
    ["a missing date", { value: 1 }],
    ["a negative value", { value: -1, readAt: "2026-09-30" }],
    ["a value as text", { value: "1", readAt: "2026-09-30" }],
    ["an impossible date", { value: 1, readAt: "2026-02-30" }],
    ["unknown fields", { ...reading, unit: "kWh" }],
  ])("answers 400 for %s", async (_case, body) => {
    expect((await submit(body)).status).toBe(400);
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("answers 400 for a contract id that is no UUID", async () => {
    expect((await submit(reading, undefined, "abc")).status).toBe(400);
  });
});

describe("POST /verbrauch/api/documents/upload-url", () => {
  const photo = {
    fileName: "zaehler.jpg",
    contentType: "image/jpeg",
    sizeBytes: 2000,
    category: "meter-photo",
  };

  it("rejects requests from another origin with 403", async () => {
    expect((await upload.POST(request(photo, "https://evil.example"))).status).toBe(403);
  });

  it("answers 401 without a session", async () => {
    readSession.mockResolvedValue(undefined);
    expect((await upload.POST(request(photo))).status).toBe(401);
  });

  it("forwards the announcement of a meter photo", async () => {
    api.POST.mockResolvedValue(apiAnswer(201, { documentId: "d" }));
    expect((await upload.POST(request(photo))).status).toBe(201);
    expect(api.POST).toHaveBeenCalledWith("/documents/upload-url", { body: photo });
  });
});
