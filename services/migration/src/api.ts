import { LegacySystem } from "@kundenportal/events";
import {
  type ApiEvent,
  type ApiHandler,
  badRequest,
  type Caller,
  callerFrom,
  forbidden,
  isPassTenant,
  json,
  router,
} from "@kundenportal/service-kit";
import type { BulkImport } from "./bulk.js";
import type { Cockpit } from "./cockpit.js";
import type { Linking } from "./links.js";

/** Cognito group of the portal owner; only its members may use the migration cockpit. */
export const OWNER_GROUP = "owner";

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

/** Cognito group of a demo pass's holder: the cockpit of the own pass tenant. */
export const PASS_GROUP = "pass";

/**
 * The cockpit's operator: the owner, or a pass holder for the pass tenant of the token
 * (architektur-mandanten §3). The tenant always comes from the token, never the URL.
 */
function owner(event: ApiEvent): Caller {
  const caller = callerFrom(event);
  const groups = groupsOf(event);
  const passHolder = groups.includes(PASS_GROUP) && isPassTenant(caller.tenantId);
  if (!groups.includes(OWNER_GROUP) && !passHolder) {
    throw forbidden("Only the owner may do this");
  }
  return caller;
}

function body(event: ApiEvent): unknown {
  if (!event.body) return {};
  try {
    const text = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
    return JSON.parse(text);
  } catch {
    throw badRequest("Body is not JSON");
  }
}

export function createHandler(bulk: BulkImport, linking: Linking, cockpit: Cockpit): ApiHandler {
  return router({
    "GET /me/links": async (event) => json(200, { links: await linking.list(callerFrom(event)) }),
    "POST /me/links": async (event) =>
      json(
        200,
        await linking.confirm(callerFrom(event), body(event), event.requestContext.requestId),
      ),
    "GET /migration/status": async (event) => json(200, await cockpit.status(owner(event))),
    "POST /migration/bulk": async (event) => {
      const caller = owner(event);
      const system = LegacySystem.safeParse((body(event) as { system?: unknown }).system);
      if (!system.success) throw badRequest("system must be utility or telco");
      return json(202, await bulk.start(caller, system.data, event.requestContext.requestId));
    },
    "POST /migration/reset": async (event) =>
      json(200, await cockpit.reset(owner(event), event.requestContext.requestId)),
    "POST /migration/dlq/{recordId}/redrive": async (event) =>
      json(
        202,
        await cockpit.redrive(
          owner(event),
          event.pathParameters?.recordId ?? "",
          body(event),
          event.requestContext.requestId,
        ),
      ),
  });
}
