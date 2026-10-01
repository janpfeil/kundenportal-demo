import { forwardWrite } from "@kundenportal/web-auth";
import { isContractId } from "@/lib/contract-update";
import { parseEmptyBody } from "@/lib/lifecycle";

type Context = { params: Promise<{ contractId: string }> };

/**
 * Takes a pending termination back; the contract runs on. The browser posts here instead of
 * sending DELETE: CloudFront signs a body for the zone's function URL only on POST and PUT
 * (architektur-zonen §4), so a DELETE with a body never reaches the zone. The API itself is
 * called with `DELETE /contracts/{id}/termination`.
 */
export async function POST(request: Request, { params }: Context) {
  const { contractId } = await params;
  return forwardWrite(
    request,
    (body) => (isContractId(contractId) ? parseEmptyBody(body) : undefined),
    (api) =>
      api.DELETE("/contracts/{contractId}/termination", { params: { path: { contractId } } }),
  );
}
