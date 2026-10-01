import { tenantData } from "@kundenportal/service-kit";
import { createApi } from "./api.js";
import { Mailbox } from "./mailbox.js";

/** Lambda entry point behind the HTTP API (`/notifications`, `/admin/customers/{id}/notifications`). */
export const handler = createApi(new Mailbox(tenantData));
