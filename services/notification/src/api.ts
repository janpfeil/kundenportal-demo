import {
  type ApiHandler,
  badRequest,
  callerFrom,
  json,
  noContent,
  notFound,
  operatorFrom,
  parseBody,
  router,
  type RouterOptions,
} from "@kundenportal/service-kit";
import { z } from "zod";
import { isNotificationId, type Mailbox } from "./mailbox.js";

const MarkRead = z.strictObject({ read: z.literal(true) });
/** Mirrors the `CustomerId` path parameter of the OpenAPI contract. */
const CustomerId = z.string().min(1).max(80);

export function createApi(mailbox: Mailbox, options?: RouterOptions): ApiHandler {
  return router(
    {
      "GET /notifications": async (event) => {
        const caller = callerFrom(event);
        const customerId = await mailbox.customerOf(caller.tenantId, caller.subject);
        const items = customerId ? await mailbox.list(caller.tenantId, customerId) : [];
        return json(200, { items });
      },
      "PATCH /notifications/{notificationId}": async (event) => {
        const caller = callerFrom(event);
        const id = event.pathParameters?.notificationId ?? "";
        if (!isNotificationId(id)) throw badRequest("Invalid notification id");
        parseBody(event, MarkRead);
        const customerId = await mailbox.customerOf(caller.tenantId, caller.subject);
        if (!customerId || !(await mailbox.markRead(caller.tenantId, customerId, id))) {
          throw notFound("Notification not found");
        }
        return noContent();
      },
      // Phase 7: the operator reads a customer's mailbox (read only, nothing is marked).
      "GET /admin/customers/{customerId}/notifications": async (event) => {
        const operator = operatorFrom(event);
        const customerId = CustomerId.safeParse(event.pathParameters?.customerId);
        if (!customerId.success) throw badRequest("Invalid customer id");
        const items = await mailbox.list(operator.tenantId, customerId.data);
        if (items.length === 0 && !(await mailbox.knows(operator.tenantId, customerId.data))) {
          throw notFound("Customer not found");
        }
        return json(200, { items });
      },
    },
    options,
  );
}
