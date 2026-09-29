import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const base = {
  APP_URL: "https://kundenportal-demo.rypox.com",
  API_URL: "https://api.example.org/api/",
  OIDC_ISSUER: "https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_pool",
  OIDC_CLIENT_ID: "client",
};

describe("loadConfig", () => {
  it("reads the standard OIDC settings", () => {
    const config = loadConfig(base);
    expect(config.apiUrl).toBe("https://api.example.org/api");
    expect(config.scope).toBe("openid email profile");
    expect(config.logoutUrl).toBeUndefined();
  });

  it("names the missing variable", () => {
    const { OIDC_ISSUER: _issuer, ...incomplete } = base;
    expect(() => loadConfig(incomplete)).toThrow(/OIDC_ISSUER/);
  });
});
