import { describe, expect, it } from "vitest";
import { sha256Hex } from "./browser.js";
import { groupsOf, tenantOf } from "./claims.js";
import { loadZoneConfig } from "./config.js";
import { deriveKey, seal, unseal } from "./crypto.js";
import { isSameOrigin } from "./origin.js";
import { loginUrl } from "./session.js";

describe("write path", () => {
  it("hashes the body as CloudFront expects (hex SHA-256)", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await sha256Hex('{"value":1}')).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts only requests from the portal's own origin", () => {
    const app = new URL("https://kundenportal-demo.rypox.com");
    expect(isSameOrigin(new Headers({ origin: "https://kundenportal-demo.rypox.com" }), app)).toBe(
      true,
    );
    expect(isSameOrigin(new Headers({ origin: "https://evil.example" }), app)).toBe(false);
    expect(isSameOrigin(new Headers(), app)).toBe(false);
  });
});

describe("session compatibility", () => {
  it("reads what the shell seals with the same secret and purpose", async () => {
    const key = deriveKey("client-secret", "session");
    const sealed = await seal(
      { sub: "s", accessToken: "t", expiresAt: 1 },
      key,
      new Date(Date.now() + 60_000),
    );
    expect(await unseal(sealed, deriveKey("client-secret", "session"))).toMatchObject({ sub: "s" });
  });
});

describe("loginUrl", () => {
  it("points absolutely at the shell's sign-in, outside the zone's basePath", () => {
    expect(loginUrl("/vertraege", new URL("https://kundenportal-demo.rypox.com"))).toBe(
      "https://kundenportal-demo.rypox.com/auth/login?returnTo=%2Fvertraege",
    );
  });
});

describe("config", () => {
  it("reads the zone settings", () => {
    const config = loadZoneConfig({
      APP_URL: "https://x.example",
      API_URL: "https://api.example/api/",
      OIDC_CLIENT_ID: "c",
    });
    expect(config.apiUrl).toBe("https://api.example/api");
    expect(() => loadZoneConfig({})).toThrow(/APP_URL/);
  });
});

describe("token claims", () => {
  const token = (payload: object) =>
    `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

  it("reads the Cognito groups from the access token", () => {
    expect(groupsOf(token({ "cognito:groups": ["pass", 7] }))).toEqual(["pass"]);
    expect(groupsOf(token({ sub: "s" }))).toEqual([]);
    expect(groupsOf("not-a-jwt")).toEqual([]);
  });

  it("reads the tenant from the access token", () => {
    expect(tenantOf(token({ tenant_id: "p4k7x2qa" }))).toBe("p4k7x2qa");
    expect(tenantOf(token({}))).toBeUndefined();
  });
});
