import { forwardWrite } from "@kundenportal/web-auth";
import { parseContractAction } from "@/lib/contracts";
import { isContractId } from "@/lib/filters";
import { dayKey } from "@/lib/time";

/**
 * The operator controls a contract (POST /admin/contracts/{contractId}/actions): option or
 * product, price version, installment, termination, block — each with a reason. Origin,
 * session and body are checked here, the operator groups by the API; its answer (the changed
 * contract, or the problem) passes through.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ contractId: string }> },
) {
  const { contractId } = await params;
  return forwardWrite(
    request,
    (body) =>
      isContractId(contractId) ? parseContractAction(body, dayKey(new Date())) : undefined,
    (api, body) =>
      api.POST("/admin/contracts/{contractId}/actions", { params: { path: { contractId } }, body }),
  );
}
