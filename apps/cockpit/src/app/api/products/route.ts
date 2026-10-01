import { forwardWrite } from "@kundenportal/web-auth";
import { parseProductInput } from "@/lib/products";

/** Creates a product as draft with price version 1 (POST /admin/products). */
export async function POST(request: Request) {
  return forwardWrite(request, parseProductInput, (api, body) =>
    api.POST("/admin/products", { body }),
  );
}
