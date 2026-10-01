import { createApi } from "./app.js";
import { createDomain } from "./wiring.js";

/** Lambda entry point behind the HTTP API (`/contracts`, `/products`, `/admin/…`). */
export const handler = createApi(createDomain());
