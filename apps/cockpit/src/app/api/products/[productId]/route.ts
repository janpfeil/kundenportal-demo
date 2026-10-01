import { forwardWrite } from "@kundenportal/web-auth";
import { isProductId, parseProductUpdate } from "@/lib/products";

/** Edits texts and terms of a product or moves its status (PATCH /admin/products/{productId}). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  return forwardWrite(
    request,
    (body) => (isProductId(productId) ? parseProductUpdate(body) : undefined),
    (api, body) =>
      api.PATCH("/admin/products/{productId}", { params: { path: { productId } }, body }),
  );
}
