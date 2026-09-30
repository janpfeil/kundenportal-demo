import { forwardWrite } from "@kundenportal/web-auth";
import { tenancyCall } from "@/lib/tenancy";

/** Revokes a demo pass (POST /tenancy/passes/{passId}/revoke); the API checks the owner group. */
export async function POST(request: Request, { params }: { params: Promise<{ passId: string }> }) {
  const { passId } = await params;
  return forwardWrite(
    request,
    () => (/^[A-Za-z0-9_-]{1,100}$/.test(passId) ? {} : undefined),
    (_api, _body, session) =>
      tenancyCall(session, "POST", `/tenancy/passes/${encodeURIComponent(passId)}/revoke`),
  );
}
