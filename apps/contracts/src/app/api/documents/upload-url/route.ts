import { forwardWrite } from "@kundenportal/web-auth";
import { parseUploadRequest } from "@kundenportal/web-auth/upload";

/** Announces an upload and returns the presigned PUT (POST /documents/upload-url). */
export async function POST(request: Request) {
  return forwardWrite(request, parseUploadRequest, (api, body) =>
    api.POST("/documents/upload-url", { body }),
  );
}
