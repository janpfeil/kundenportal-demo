import { decodeJwt, type JWTPayload } from "jose";

/** Cognito group of the portal owner (full cockpit, pass administration). */
export const OWNER_GROUP = "owner";
/** Cognito group of demo-pass holders (cockpit of their own tenant only). */
export const PASS_GROUP = "pass";

/*
 * Claims of the session's access token. The token is not verified here: it came from the
 * provider to the server and was kept in the encrypted session cookie. The results only
 * decide what the UI shows; the API checks the token itself on every call.
 */

function claims(accessToken: string): JWTPayload {
  try {
    return decodeJwt(accessToken);
  } catch {
    return {};
  }
}

/** Cognito groups (`cognito:groups`). */
export function groupsOf(accessToken: string): string[] {
  const claim = claims(accessToken)["cognito:groups"];
  return Array.isArray(claim) ? claim.filter((group) => typeof group === "string") : [];
}

/** Tenant of the account (`tenant_id`, set by the pre-token trigger); undefined if absent. */
export function tenantOf(accessToken: string): string | undefined {
  const claim = claims(accessToken)["tenant_id"];
  return typeof claim === "string" ? claim : undefined;
}

/** What the navigation offers: the cockpit (owner and pass holders) and the pass status. */
export interface NavigationRoles {
  cockpit: boolean;
  pass: boolean;
}

/** Navigation roles from the Cognito groups of the session's access token. */
export function rolesOf(accessToken: string | undefined): NavigationRoles {
  const groups = accessToken ? groupsOf(accessToken) : [];
  const pass = groups.includes(PASS_GROUP);
  return { cockpit: pass || groups.includes(OWNER_GROUP), pass };
}
