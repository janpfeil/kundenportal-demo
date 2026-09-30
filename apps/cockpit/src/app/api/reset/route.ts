import { forwardWrite } from "@kundenportal/web-auth";

/** Demo reset (POST /migration/reset); the API checks the owner group. */
export async function POST(request: Request) {
  return forwardWrite(
    request,
    () => ({}),
    (api) => api.POST("/migration/reset"),
  );
}
