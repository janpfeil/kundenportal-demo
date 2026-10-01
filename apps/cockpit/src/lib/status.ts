import type { MigrationStatus } from "@kundenportal/api-contract";
import { type Session, apiFor } from "@kundenportal/web-auth";
import { cache } from "react";

export interface StatusResult {
  status: MigrationStatus | undefined;
  /** HTTP status of the answer; 0 when the API was not reachable. */
  code: number;
}

/**
 * GET /migration/status once per request: the layout (bell and sidebar counts) and the
 * overview share it. The API scopes it to the caller's tenant and checks the groups.
 */
export const loadStatus = cache(async (session: Session): Promise<StatusResult> => {
  try {
    const { data, response } = await apiFor(session).GET("/migration/status");
    return { status: response.ok ? data : undefined, code: response.status };
  } catch {
    return { status: undefined, code: 0 };
  }
});
