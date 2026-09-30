import { forwardWrite } from "@/lib/forward";
import { isContractId, parseNewReading } from "@/lib/reading";

/** J4: submits a meter reading (POST /contracts/{id}/readings). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ contractId: string }> },
) {
  const { contractId } = await params;
  return forwardWrite(
    request,
    (body) => (isContractId(contractId) ? parseNewReading(body) : undefined),
    (api, body) =>
      api.POST("/contracts/{contractId}/readings", { params: { path: { contractId } }, body }),
  );
}
