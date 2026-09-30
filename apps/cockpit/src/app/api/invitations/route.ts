import { forwardWrite } from "@/lib/forward";
import { parseInvitation, tenancyCall } from "@/lib/tenancy";

/** Creates a demo-pass invitation (POST /tenancy/invitations); the API checks the owner group. */
export async function POST(request: Request) {
  return forwardWrite(request, parseInvitation, (_api, body, session) =>
    tenancyCall(session, "POST", "/tenancy/invitations", body),
  );
}
