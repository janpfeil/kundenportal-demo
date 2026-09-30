import { type ApiHandler, callerFrom, json, parseBody, router } from "@kundenportal/service-kit";
import { UploadRequest } from "./model.js";
import type { DocumentService } from "./service.js";

export function createApi(service: DocumentService): ApiHandler {
  return router({
    "GET /documents": async (event) => json(200, { items: await service.list(callerFrom(event)) }),
    "POST /documents/upload-url": async (event) => {
      const caller = callerFrom(event);
      const request = parseBody(event, UploadRequest);
      return json(201, await service.requestUpload(caller, request));
    },
  });
}
