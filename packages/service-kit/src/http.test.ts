import { describe, expect, it } from "vitest";
import { z } from "zod";
import { notFound } from "./errors.js";
import { json, parseBody, router } from "./http.js";
import { callerFrom, tenantKey } from "./identity.js";
import { apiEvent } from "./testing/api-event.js";

describe("router", () => {
  const handle = router({
    "GET /ok": async () => json(200, { ok: true }),
    "GET /missing": async () => {
      throw notFound("nothing here");
    },
    "GET /boom": async () => {
      throw new Error("secret internals");
    },
  });

  it("dispatches by route key", async () => {
    const result = await handle(apiEvent("GET /ok"));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? "")).toEqual({ ok: true });
  });

  it("maps HttpError to problem details", async () => {
    const result = await handle(apiEvent("GET /missing"));
    expect(result.statusCode).toBe(404);
    expect(result.headers?.["content-type"]).toBe("application/problem+json");
    expect(JSON.parse(result.body ?? "")).toEqual({
      title: "Not Found",
      status: 404,
      detail: "nothing here",
    });
  });

  it("hides unexpected errors behind a 500", async () => {
    const result = await handle(apiEvent("GET /boom"));
    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain("secret");
  });

  it("answers unknown routes with 404", async () => {
    expect((await handle(apiEvent("DELETE /ok"))).statusCode).toBe(404);
  });
});

describe("parseBody", () => {
  const schema = z.strictObject({ name: z.string().min(1) });

  it("returns the validated body", () => {
    expect(parseBody(apiEvent("PATCH /x", { body: { name: "Anna" } }), schema)).toEqual({
      name: "Anna",
    });
  });

  it("rejects invalid JSON and schema violations with 400", () => {
    const broken = { ...apiEvent("PATCH /x"), body: "{" };
    expect(() => parseBody(broken, schema)).toThrow(/not valid JSON/);
    expect(() => parseBody(apiEvent("PATCH /x", { body: { name: "" } }), schema)).toThrow(
      /Bad Request/,
    );
    expect(() =>
      parseBody(apiEvent("PATCH /x", { body: { name: "A", admin: true } }), schema),
    ).toThrow();
  });
});

describe("callerFrom", () => {
  it("reads tenant, subject and optional profile claims", () => {
    const event = apiEvent("GET /me", { claims: { email: "anna@example.org", locale: "en" } });
    expect(callerFrom(event)).toEqual({
      tenantId: "owner",
      subject: "sub-1",
      email: "anna@example.org",
      locale: "en",
    });
  });

  it("rejects tokens without a valid tenant", () => {
    expect(() => callerFrom(apiEvent("GET /me", { claims: { tenant_id: "" } }))).toThrow(/tenant/);
    expect(() => callerFrom(apiEvent("GET /me", { claims: { tenant_id: "A#B" } }))).toThrow(
      /tenant/,
    );
  });

  it("builds tenant-scoped keys", () => {
    expect(tenantKey("owner", "CUST", "c-1")).toBe("TENANT#owner#CUST#c-1");
  });
});
