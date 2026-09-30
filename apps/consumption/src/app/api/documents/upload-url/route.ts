import { forwardWrite } from "@/lib/forward";
import { parseUploadRequest } from "@/lib/upload";

/** Announces an upload and returns the presigned PUT (POST /documents/upload-url). */
export async function POST(request: Request) {
  return forwardWrite(request, parseUploadRequest, (api, body) =>
    api.POST("/documents/upload-url", { body }),
  );
}
