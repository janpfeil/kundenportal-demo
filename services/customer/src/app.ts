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
import { CustomerUpdate } from "./customer.js";
import { parseCustomerQuery } from "./directory.js";
import type { CustomerService } from "./service.js";

/** Mirrors the `CustomerId` path parameter of the OpenAPI contract. */
const CustomerId = z.string().min(1).max(80);

export function createHandler(service: CustomerService, options?: RouterOptions): ApiHandler {
  return router(
    {
      "GET /me": async (event) =>
        json(200, await service.me(callerFrom(event), event.requestContext.requestId)),
      "PATCH /me": async (event) => {
        const caller = callerFrom(event);
        const update = parseBody(event, CustomerUpdate);
        return json(200, await service.updateMe(caller, update, event.requestContext.requestId));
      },
      // Phase 7: the operator's back office (owner, or the holder of the own pass tenant).
      "GET /admin/customers": async (event) => {
        const operator = operatorFrom(event);
        const query = parseCustomerQuery(event.queryStringParameters);
        return json(200, await service.listCustomers(operator, query));
      },
      "GET /admin/customers/{customerId}": async (event) => {
        const operator = operatorFrom(event);
        const customerId = CustomerId.safeParse(event.pathParameters?.customerId);
        if (!customerId.success) throw badRequest("Invalid customer id");
        return json(200, await service.customerSummary(operator, customerId.data));
      },
    },
    options,
  );
}
