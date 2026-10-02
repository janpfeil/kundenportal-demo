import * as client from "openid-client";
import { clientSecret } from "./client-secret";
import { config } from "./config";

let discovered: Promise<client.Configuration> | undefined;

/** Discovers the provider once per instance (standard `.well-known/openid-configuration`). */
export function oidc(): Promise<client.Configuration> {
  const settings = config();
  discovered ??= clientSecret(settings)
    .then((secret) => client.discovery(settings.issuer, settings.clientId, secret))
    .catch((error: unknown) => {
      discovered = undefined;
      throw error;
    });
  return discovered;
}

export function callbackUrl(): string {
  return new URL("/auth/callback", config().appUrl).href;
}

/**
 * Where to send the browser after the local session is cleared: a configured logout URL in
 * Cognito's form (`client_id` + `logout_uri`) first — Cognito lists its `/logout` as
 * `end_session_endpoint`, but ignores `post_logout_redirect_uri` there and sends the browser
 * to a login page that answers "invalid request" — otherwise the provider's standard
 * end-session endpoint, otherwise straight back to the start page.
 */
export async function logoutUrl(): Promise<string> {
  const settings = config();
  const home = new URL("/", settings.appUrl).href;
  if (settings.logoutUrl) {
    const url = new URL(settings.logoutUrl);
    url.searchParams.set("client_id", settings.clientId);
    url.searchParams.set("logout_uri", home);
    return url.href;
  }
  const configuration = await oidc();
  if (configuration.serverMetadata().end_session_endpoint) {
    return client.buildEndSessionUrl(configuration, { post_logout_redirect_uri: home }).href;
  }
  return home;
}

export { client };
