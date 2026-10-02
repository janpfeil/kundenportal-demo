import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type ShellConfig } from "./config";

const state = vi.hoisted(() => ({ config: undefined as ShellConfig | undefined }));

vi.mock("./config", async (actual) => ({
  ...(await actual<typeof import("./config")>()),
  config: () => state.config,
}));
vi.mock("./client-secret", () => ({ clientSecret: async () => "secret" }));
vi.mock("openid-client", async (actual) => ({
  ...(await actual<typeof import("openid-client")>()),
  // Cognito lists its /logout as end_session_endpoint.
  discovery: async () => ({
    serverMetadata: () => ({
      issuer: "https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_pool",
      end_session_endpoint: "https://kundenportal-demo.auth.example.org/logout",
    }),
  }),
  buildEndSessionUrl: (
    configuration: { serverMetadata: () => { end_session_endpoint: string } },
    parameters: Record<string, string>,
  ) => {
    const url = new URL(configuration.serverMetadata().end_session_endpoint);
    for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
    return url;
  },
}));

const { logoutUrl } = await import("./oidc");

const env = {
  APP_URL: "https://kundenportal-demo.rypox.com",
  API_URL: "https://api.example.org/api",
  OIDC_ISSUER: "https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_pool",
  OIDC_CLIENT_ID: "client",
};

beforeEach(() => {
  state.config = loadConfig(env);
});

describe("logoutUrl", () => {
  it("uses Cognito's form (client_id + logout_uri) although an end-session endpoint exists", async () => {
    state.config = loadConfig({
      ...env,
      OIDC_LOGOUT_URL: "https://kundenportal-demo.auth.example.org/logout",
    });
    const url = new URL(await logoutUrl());
    expect(url.origin + url.pathname).toBe("https://kundenportal-demo.auth.example.org/logout");
    expect(url.searchParams.get("client_id")).toBe("client");
    expect(url.searchParams.get("logout_uri")).toBe("https://kundenportal-demo.rypox.com/");
    expect(url.searchParams.has("post_logout_redirect_uri")).toBe(false);
  });

  it("falls back to the standard end-session endpoint without a configured logout URL", async () => {
    const url = new URL(await logoutUrl());
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://kundenportal-demo.rypox.com/",
    );
  });
});
