import { LegacySystem } from "@kundenportal/events";
import {
  type ApiEvent,
  type ApiHandler,
  badRequest,
  callerFrom,
  json,
  operatorFrom,
  router,
} from "@kundenportal/service-kit";
import type { BulkImport } from "./bulk.js";
import type { Cockpit } from "./cockpit.js";
import type { Linking } from "./links.js";

export { OWNER_GROUP, PASS_GROUP, groupsOf } from "@kundenportal/service-kit";

/** The cockpit's operator (owner, or a pass holder in the own pass tenant). */
const owner = operatorFrom;

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
    // Same operators as the status; the tenant comes from the token, only `q` from the URL.
    "GET /migration/search": async (event) =>
      json(200, await cockpit.search(owner(event), event.queryStringParameters?.q)),
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
