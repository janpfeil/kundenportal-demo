import { beforeEach, describe, expect, it, vi } from "vitest";
import { product } from "@/test-fixtures";

const api = { POST: vi.fn(), PATCH: vi.fn() };
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
  const forwardWrite = original.writePath({
    readSession: mocked.readSession,
    appUrl: () => mocked.zoneConfig().appUrl,
    apiFor: (session) => mocked.apiFor(session) as never,
  });
  return { ...original, ...mocked, forwardWrite };
});

const { POST: act } = await import("./contracts/[contractId]/actions/route");
const { POST: create } = await import("./products/route");
const { PATCH: update } = await import("./products/[productId]/route");
const { POST: version } = await import("./products/[productId]/versions/route");

const session = { sub: "s", accessToken: "token", expiresAt: Date.now() + 60_000 };
const request = (body: unknown, method = "POST", origin = "https://portal.example") =>
  new Request("https://function.example/cockpit/api/x", {
    method,
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
const ID = "0a1b2c3d-1111-2222-3333-444455556666";
const contractParams = (contractId: string) => ({ params: Promise.resolve({ contractId }) });
const productParams = (productId: string) => ({ params: Promise.resolve({ productId }) });
const ok = (status = 200) => ({ data: { ok: true }, response: new Response(null, { status }) });

beforeEach(() => {
  vi.clearAllMocks();
  readSession.mockResolvedValue(session);
  api.POST.mockResolvedValue(ok());
  api.PATCH.mockResolvedValue(ok());
});

describe("operator routes", () => {
  it("forward a contract action with its reason", async () => {
    const response = await act(
      request({ type: "block", reason: " Zahlungsrückstand " }),
      contractParams(ID),
    );
    expect(response.status).toBe(200);
    expect(api.POST).toHaveBeenCalledWith("/admin/contracts/{contractId}/actions", {
      params: { path: { contractId: ID } },
      body: { type: "block", reason: "Zahlungsrückstand" },
    });
  });

  it("refuse actions without reason, of unknown type, in the past or for a bad id", async () => {
    expect((await act(request({ type: "block" }), contractParams(ID))).status).toBe(400);
    expect((await act(request({ type: "erase", reason: "weg" }), contractParams(ID))).status).toBe(
      400,
    );
    expect(
      (
        await act(
          request({ type: "terminate", effectiveDate: "2020-01-31", reason: "alt" }),
          contractParams(ID),
        )
      ).status,
    ).toBe(400);
    expect(
      (await act(request({ type: "block", reason: "Grund" }), contractParams("../x"))).status,
    ).toBe(400);
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("pass the API's problems through (not operator, conflict)", async () => {
    api.POST.mockResolvedValue({
      error: { title: "Conflict", status: 409 },
      response: new Response(null, { status: 409 }),
    });
    const response = await act(request({ type: "unblock", reason: "geklärt" }), contractParams(ID));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ title: "Conflict", status: 409 });
  });

  it("create a product, change its status and add a price version", async () => {
    const {
      versions: _versions,
      contractCount: _count,
      status: _status,
      version: _version,
      updatedAt: _at,
      unit: _unit,
      ...input
    } = product();
    api.POST.mockResolvedValue(ok(201));
    expect((await create(request(input))).status).toBe(201);
    expect(api.POST).toHaveBeenCalledWith("/admin/products", { body: input });

    expect(
      (await update(request({ status: "retiring" }, "PATCH"), productParams("strom-klassik")))
        .status,
    ).toBe(200);
    expect(api.PATCH).toHaveBeenCalledWith("/admin/products/{productId}", {
      params: { path: { productId: "strom-klassik" } },
      body: { status: "retiring" },
    });

    const body = { validFrom: "2099-01-01", options: input.options };
    expect((await version(request(body), productParams("strom-klassik"))).status).toBe(201);
    expect(api.POST).toHaveBeenLastCalledWith("/admin/products/{productId}/versions", {
      params: { path: { productId: "strom-klassik" } },
      body,
    });
  });

  it("refuse malformed products, foreign origins and missing sessions", async () => {
    expect((await create(request({ productId: "x" }))).status).toBe(400);
    expect(
      (await update(request({ status: "gone" }, "PATCH"), productParams("strom-klassik"))).status,
    ).toBe(400);
    expect(
      (await update(request({ status: "active" }, "PATCH"), productParams("Strom!"))).status,
    ).toBe(400);
    expect(
      (
        await version(
          request({ validFrom: "2020-01-01", options: product().options }),
          productParams("strom-klassik"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await update(
          request({ status: "active" }, "PATCH", "https://evil.example"),
          productParams("strom-klassik"),
        )
      ).status,
    ).toBe(403);
    readSession.mockResolvedValue(undefined);
    expect(
      (await act(request({ type: "block", reason: "Grund" }), contractParams(ID))).status,
    ).toBe(401);
    expect(api.POST).not.toHaveBeenCalled();
    expect(api.PATCH).not.toHaveBeenCalled();
  });
});
