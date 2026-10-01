import {
  type ApiHandler,
  badRequest,
  callerFrom,
  json,
  operatorFrom,
  parseBody,
  router,
  type RouterOptions,
} from "@kundenportal/service-kit";
import { z } from "zod";
import { UploadRequest } from "./model.js";
import type { DocumentService } from "./service.js";

/** Mirrors the `CustomerId` path parameter of the OpenAPI contract. */
const CustomerId = z.string().min(1).max(80);

export function createApi(service: DocumentService, options?: RouterOptions): ApiHandler {
  return router(
    {
      "GET /documents": async (event) =>
        json(200, { items: await service.list(callerFrom(event)) }),
      "POST /documents/upload-url": async (event) => {
        const caller = callerFrom(event);
        const request = parseBody(event, UploadRequest);
        return json(
          201,
          await service.requestUpload(caller, request, event.requestContext.requestId),
        );
      },
      // Phase 7: the operator sees a customer's documents (metadata only, no download).
      "GET /admin/customers/{customerId}/documents": async (event) => {
        const operator = operatorFrom(event);
        const customerId = CustomerId.safeParse(event.pathParameters?.customerId);
        if (!customerId.success) throw badRequest("Invalid customer id");
        return json(200, { items: await service.listOf(operator, customerId.data) });
      },
    },
    options,
  );
}
