import { forbidden } from "./errors.js";
import type { ApiEvent } from "./http.js";

/** Claim that carries the tenant; added to access tokens by the identity provider. */
export const TENANT_CLAIM = "tenant_id";

/** The caller as the API sees it, taken only from the verified access token. */
export interface Caller {
  tenantId: string;
  subject: string;
  email?: string;
  name?: string;
  locale?: string;
}

const TENANT_PATTERN = /^[a-z0-9-]{1,40}$/;

function claim(claims: Record<string, unknown>, name: string): string | undefined {
  const value = claims[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Reads the caller from the JWT claims the API gateway has already verified.
 * The tenant is never taken from the URL or body; a token without a valid tenant
 * claim is rejected.
 */
export function callerFrom(event: ApiEvent): Caller {
  const claims = (event.requestContext.authorizer?.jwt?.claims ?? {}) as Record<string, unknown>;
  const subject = claim(claims, "sub");
  const tenantId = claim(claims, TENANT_CLAIM);
  if (!subject) throw forbidden("Token has no subject");
  if (!tenantId || !TENANT_PATTERN.test(tenantId)) throw forbidden("Token has no valid tenant");
  const caller: Caller = { tenantId, subject };
  const email = claim(claims, "email");
  const name = claim(claims, "name");
  const locale = claim(claims, "locale");
  if (email) caller.email = email;
  if (name) caller.name = name;
  if (locale) caller.locale = locale;
  return caller;
}

/** Key prefix that scopes every item of the single table to one tenant. */
export function tenantKey(tenantId: string, ...parts: string[]): string {
  return ["TENANT", tenantId, ...parts].join("#");
}
