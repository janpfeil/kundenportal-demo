/**
 * Runtime configuration shared by all zones, read at request time from the environment
 * (the CDK app sets the same variables for every zone function).
 */
export interface ZoneConfig {
  /** Public base URL of the portal, e.g. https://kundenportal-demo.rypox.com */
  appUrl: URL;
  /** Base URL of the portal API as the server calls it (no trailing slash). */
  apiUrl: string;
  clientId: string;
  /** Lets the server read the client secret from Cognito instead of an env variable. */
  userPoolId?: string;
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function loadZoneConfig(env: Env = process.env): ZoneConfig {
  const config: ZoneConfig = {
    appUrl: new URL(required(env, "APP_URL")),
    apiUrl: required(env, "API_URL").replace(/\/+$/, ""),
    clientId: required(env, "OIDC_CLIENT_ID"),
  };
  if (env.COGNITO_USER_POOL_ID) config.userPoolId = env.COGNITO_USER_POOL_ID;
  return config;
}

let cached: ZoneConfig | undefined;

export function zoneConfig(): ZoneConfig {
  cached ??= loadZoneConfig();
  return cached;
}
