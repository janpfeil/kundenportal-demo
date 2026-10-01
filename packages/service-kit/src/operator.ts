import { forbidden } from "./errors.js";
import type { ApiEvent } from "./http.js";
import { type Caller, callerFrom } from "./identity.js";
import { isPassTenant } from "./tenant-data.js";

/** Cognito group of the portal owner: the operator of the owner tenant. */
export const OWNER_GROUP = "owner";
/** Cognito group of a demo pass's holder: the operator of the own pass tenant. */
export const PASS_GROUP = "pass";

/**
 * Groups from the access token. The HTTP API's JWT authorizer passes array claims as a
 * string like `[owner other]`.
 */
export function groupsOf(event: ApiEvent): string[] {
  const claim = event.requestContext.authorizer?.jwt?.claims?.["cognito:groups"];
  if (Array.isArray(claim)) return claim.map(String);
  if (typeof claim !== "string") return [];
  return claim
    .replace(/^\[|\]$/g, "")
    .split(/[\s,]+/)
    .filter(Boolean);
}

/**
 * The operator of the token's tenant (cockpit, back office): the owner, or a pass holder
 * for the pass tenant of the token (architektur-mandanten §3). The tenant always comes
 * from the token, never the URL; everyone else gets 403.
 */
export function operatorFrom(event: ApiEvent): Caller {
  const caller = callerFrom(event);
  const groups = groupsOf(event);
  const passHolder = groups.includes(PASS_GROUP) && isPassTenant(caller.tenantId);
  if (!groups.includes(OWNER_GROUP) && !passHolder) {
    throw forbidden("Only the operator may do this");
  }
  return caller;
}
