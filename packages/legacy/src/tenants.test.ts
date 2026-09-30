import { describe, expect, it, vi } from "vitest";
import { LegacyUnavailableError } from "./http.js";
import { TelcoClient } from "./telco.js";
import { UtilityClient } from "./utility.js";

const jsonResponse = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const fakeFetch = (status: number, body?: unknown) =>
  vi.fn<typeof fetch>(async () => jsonResponse(status, body));

const sent = (fetchMock: ReturnType<typeof fakeFetch>) => {
  const [url, init = {}] = fetchMock.mock.calls[0] ?? [];
  return {
    url,
    method: init.method,
    headers: init.headers,
    body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
};

const utility = (fetchMock: ReturnType<typeof fakeFetch>) =>
  new UtilityClient({ baseUrl: "https://u", apiKey: "k", fetch: fetchMock });
const telco = (fetchMock: ReturnType<typeof fakeFetch>) =>
  new TelcoClient({ baseUrl: "https://t", apiKey: "k", fetch: fetchMock });

describe("utility tenant provisioning", () => {
  it("provisions a demo tenant with its demo password", async () => {
    const fetchMock = fakeFetch(201, { status: "eingerichtet" });
    await utility(fetchMock).provisionTenant("pass-p4k7x2qa", "Zufall-Passwort-1");
    expect(sent(fetchMock)).toMatchObject({
      url: "https://u/api/v1/verwaltung/mandant",
      method: "PUT",
      headers: { "x-api-key": "k", "x-mandant": "pass-p4k7x2qa" },
      body: { demoPasswort: "Zufall-Passwort-1" },
    });
  });

  it("removes a demo tenant and resets with or without a password", async () => {
    const removed = fakeFetch(204);
    await utility(removed).removeTenant("pass-1");
    expect(sent(removed)).toMatchObject({
      url: "https://u/api/v1/verwaltung/mandant",
      method: "DELETE",
      headers: { "x-mandant": "pass-1" },
    });
    const demo = fakeFetch(200, { status: "zurückgesetzt" });
    await utility(demo).resetTenant("pass-1", "Zufall-Passwort-1");
    expect(sent(demo)).toMatchObject({
      url: "https://u/api/v1/verwaltung/zuruecksetzen",
      method: "POST",
      body: { demoPasswort: "Zufall-Passwort-1" },
    });
    const owner = fakeFetch(200, { status: "zurückgesetzt" });
    await utility(owner).resetTenant("owner");
    expect(sent(owner).body).toBeUndefined();
  });

  it("fails loudly when the legacy system refuses", async () => {
    await expect(utility(fakeFetch(409)).provisionTenant("owner", "x")).rejects.toBeInstanceOf(
      LegacyUnavailableError,
    );
    await expect(utility(fakeFetch(400)).resetTenant("pass-1")).rejects.toBeInstanceOf(
      LegacyUnavailableError,
    );
    await expect(utility(fakeFetch(502)).removeTenant("pass-1")).rejects.toBeInstanceOf(
      LegacyUnavailableError,
    );
  });
});

describe("telco tenant provisioning", () => {
  it("provisions, removes and resets a demo tenant", async () => {
    const provisioned = fakeFetch(201, { status: "provisioned" });
    await telco(provisioned).provisionTenant("pass-1", "Random-password-1");
    expect(sent(provisioned)).toMatchObject({
      url: "https://t/v2/admin/tenant",
      method: "PUT",
      headers: { authorization: "ApiKey k", "x-tenant": "pass-1" },
      body: { demoPassword: "Random-password-1" },
    });
    const removed = fakeFetch(204);
    await telco(removed).removeTenant("pass-1");
    expect(sent(removed)).toMatchObject({ url: "https://t/v2/admin/tenant", method: "DELETE" });
    const reset = fakeFetch(200, { status: "reset" });
    await telco(reset).resetTenant("pass-1", "Random-password-1");
    expect(sent(reset)).toMatchObject({
      url: "https://t/v2/admin/reset",
      method: "POST",
      body: { demoPassword: "Random-password-1" },
    });
    const owner = fakeFetch(200, { status: "reset" });
    await telco(owner).resetTenant("owner");
    expect(sent(owner).body).toBeUndefined();
  });

  it("fails loudly when the legacy system refuses", async () => {
    await expect(telco(fakeFetch(400)).provisionTenant("pass-1", "x")).rejects.toBeInstanceOf(
      LegacyUnavailableError,
    );
    await expect(telco(fakeFetch(404)).resetTenant("pass-1", "x")).rejects.toBeInstanceOf(
      LegacyUnavailableError,
    );
  });
});

describe("telco password check", () => {
  it("checks a demo tenant's password at the legacy system", async () => {
    const fetchMock = fakeFetch(200, { subscriberId: "T/88-4711" });
    expect(await telco(fetchMock).checkLogin("pass-1", "b.yilmaz@example.net", "pw")).toBe(
      "T/88-4711",
    );
    expect(sent(fetchMock)).toMatchObject({
      url: "https://t/v2/auth/check",
      method: "POST",
      headers: { "x-tenant": "pass-1" },
      body: { login: "b.yilmaz@example.net", password: "pw" },
    });
  });

  it("treats wrong credentials and unknown tenants as a failed sign-in", async () => {
    for (const [status, error] of [
      [401, "invalid_credentials"],
      [400, "invalid_request"],
      [404, "unknown_tenant"],
    ] as const) {
      expect(await telco(fakeFetch(status, { error })).checkLogin("pass-1", "a", "b")).toBe(
        undefined,
      );
    }
  });

  it("reports an outage or an unexpected answer instead of a wrong password", async () => {
    await expect(telco(fakeFetch(503)).checkLogin("pass-1", "a", "b")).rejects.toBeInstanceOf(
      LegacyUnavailableError,
    );
    await expect(telco(fakeFetch(200, {})).checkLogin("pass-1", "a", "b")).rejects.toBeInstanceOf(
      LegacyUnavailableError,
    );
  });
});
