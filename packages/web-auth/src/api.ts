import { createApiClient } from "@kundenportal/api-contract";
import { zoneConfig } from "./config.js";
import type { Session } from "./session.js";

/** Typed portal API client that calls the API with the access token of the session. */
export function apiFor(session: Session) {
  return createApiClient(zoneConfig().apiUrl, async () => session.accessToken);
}
