import {
  type ApiHandler,
  badRequest,
  callerFrom,
  json,
  noContent,
  notFound,
  parseBody,
  router,
} from "@kundenportal/service-kit";
import { z } from "zod";
import { isNotificationId, type Mailbox } from "./mailbox.js";

const MarkRead = z.strictObject({ read: z.literal(true) });

export function createApi(mailbox: Mailbox): ApiHandler {
  return router({
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
  });
}
