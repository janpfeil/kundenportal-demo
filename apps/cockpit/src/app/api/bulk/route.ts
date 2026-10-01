import { forwardWrite } from "@kundenportal/web-auth";

type BulkBody = { system: "utility" | "telco" };

/** J7: starts a bulk import (POST /migration/bulk); the API checks the owner group. */
export async function POST(request: Request) {
  return forwardWrite(
    request,
    (body): BulkBody | undefined => {
      const system = (body as { system?: unknown } | null)?.system;
      return system === "utility" || system === "telco" ? { system } : undefined;
    },
    (api, body) => api.POST("/migration/bulk", { body }),
  );
}
