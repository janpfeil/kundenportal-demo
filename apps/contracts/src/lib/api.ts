import { createApiClient } from "@kundenportal/api-contract";
import { type Session, apiFor } from "@kundenportal/web-auth";

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * The portal API client of the session, typed. `apiFor`'s emitted declarations refer to
 * `openapi-fetch`, which `@kundenportal/web-auth` does not depend on; seen from a zone the
 * client is then untyped. The api-contract package resolves it and restores the types.
 */
export function typedApi(session: Session): ApiClient {
  return apiFor(session) as ApiClient;
}
