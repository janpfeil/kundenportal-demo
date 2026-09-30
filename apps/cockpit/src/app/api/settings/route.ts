import { forwardWrite } from "@kundenportal/web-auth";
import { parseSettingsUpdate } from "@/lib/settings";
import { tenancyCall } from "@/lib/tenancy";

/**
 * Changes the demo-pass settings (PUT /tenancy/settings): open or close redemption, set
 * the cap of concurrent pass tenants. Origin and session are checked here, the owner group
 * by the API; its answer (the new settings) passes through.
 */
export async function PUT(request: Request) {
  return forwardWrite(request, parseSettingsUpdate, (_api, body, session) =>
    tenancyCall(session, "PUT", "/tenancy/settings", body),
  );
}
