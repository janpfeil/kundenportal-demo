import { forwardWrite } from "@kundenportal/web-auth";
import { parseContractOrder } from "@/lib/order";

/** Phase 7: concludes a contract for an option of an active product (POST /contracts). */
export async function POST(request: Request) {
  return forwardWrite(request, parseContractOrder, (api, body) => api.POST("/contracts", { body }));
}
