import { createApi } from "./api.js";
import { createApiUseCases } from "./wiring.js";

/** Lambda entry point of the JWT routes (`/tenancy/invitations`, `/tenancy/passes…`, `/tenancy/pass`, `/tenancy/settings`). */
const { passes, settings } = createApiUseCases();
export const handler = createApi(passes, settings);
