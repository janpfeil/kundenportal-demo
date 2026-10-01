import { forwardWrite } from "@kundenportal/web-auth";
import { isContractId } from "@/lib/contract-update";
import { parseEmptyBody } from "@/lib/lifecycle";

/** Withdraws from a contract concluded in the portal, within 14 days; ends it at once. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ contractId: string }> },
) {
  const { contractId } = await params;
  return forwardWrite(
    request,
    (body) => (isContractId(contractId) ? parseEmptyBody(body) : undefined),
    (api) => api.POST("/contracts/{contractId}/withdrawal", { params: { path: { contractId } } }),
  );
}
