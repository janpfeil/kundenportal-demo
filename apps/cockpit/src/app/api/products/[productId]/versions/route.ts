import { forwardWrite } from "@kundenportal/web-auth";
import { isProductId, parsePriceVersionInput } from "@/lib/products";
import { dayKey } from "@/lib/time";

/**
 * New prices for a product's options from a date on (POST /admin/products/{productId}/versions);
 * running contracts keep their version until the operator moves them.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  return forwardWrite(
    request,
    (body) =>
      isProductId(productId) ? parsePriceVersionInput(body, dayKey(new Date())) : undefined,
    (api, body) =>
      api.POST("/admin/products/{productId}/versions", { params: { path: { productId } }, body }),
  );
}
