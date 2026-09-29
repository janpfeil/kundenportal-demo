/**
 * Runtime configuration of the shell, read from environment variables at request time
 * (not at build time, so one build runs in every environment).
 *
 * Only standard OpenID Connect settings are required; the Cognito-specific ones
 * (`COGNITO_USER_POOL_ID`, `OIDC_LOGOUT_URL`) are optional helpers.
 */
export interface ShellConfig {
  /** Public base URL of the portal, e.g. https://kundenportal-demo.rypox.com */
  appUrl: URL;
  /** Base URL of the portal API as the server calls it (no trailing slash). */
  apiUrl: string;
  issuer: URL;
  clientId: string;
  scope: string;
  /** Provider logout endpoint for providers without `end_session_endpoint` (Cognito). */
  logoutUrl?: URL;
  /** Lets the server read the client secret from Cognito instead of an env variable. */
  userPoolId?: string;
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function loadConfig(env: Env = process.env): ShellConfig {
  const config: ShellConfig = {
    appUrl: new URL(required(env, "APP_URL")),
    apiUrl: required(env, "API_URL").replace(/\/+$/, ""),
    issuer: new URL(required(env, "OIDC_ISSUER")),
    clientId: required(env, "OIDC_CLIENT_ID"),
    scope: env.OIDC_SCOPE ?? "openid email profile",
  };
  if (env.OIDC_LOGOUT_URL) config.logoutUrl = new URL(env.OIDC_LOGOUT_URL);
  if (env.COGNITO_USER_POOL_ID) config.userPoolId = env.COGNITO_USER_POOL_ID;
  return config;
}

let cached: ShellConfig | undefined;

export function config(): ShellConfig {
  cached ??= loadConfig();
  return cached;
}
