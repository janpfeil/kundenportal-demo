import { type ApiHandler, callerFrom, json, parseBody, router } from "@kundenportal/service-kit";
import { CustomerUpdate } from "./customer.js";
import type { CustomerService } from "./service.js";

export function createHandler(service: CustomerService): ApiHandler {
  return router({
    "GET /me": async (event) =>
      json(200, await service.me(callerFrom(event), event.requestContext.requestId)),
    "PATCH /me": async (event) => {
      const caller = callerFrom(event);
      const update = parseBody(event, CustomerUpdate);
      return json(200, await service.updateMe(caller, update, event.requestContext.requestId));
    },
  });
}
