import { isContractId, parseContractUpdate } from "@/lib/contract-update";
import { forwardWrite } from "@/lib/forward";

/** J6: changes the installment and/or tariff option of a contract (PATCH /contracts/{id}). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ contractId: string }> },
) {
  const { contractId } = await params;
  return forwardWrite(
    request,
    (body) => (isContractId(contractId) ? parseContractUpdate(body) : undefined),
    (api, body) => api.PATCH("/contracts/{contractId}", { params: { path: { contractId } }, body }),
  );
}
