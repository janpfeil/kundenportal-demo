import { forwardWrite } from "@kundenportal/web-auth";
import { isContractId } from "@/lib/contract-update";
import { parseTerminationRequest } from "@/lib/lifecycle";

type Context = { params: Promise<{ contractId: string }> };

/** Gives notice to terminate the contract, at the earliest or a later date. */
export async function POST(request: Request, { params }: Context) {
  const { contractId } = await params;
  return forwardWrite(
    request,
    (body) => (isContractId(contractId) ? parseTerminationRequest(body) : undefined),
    (api, body) =>
      api.POST("/contracts/{contractId}/termination", {
        params: { path: { contractId } },
        body,
      }),
  );
}
