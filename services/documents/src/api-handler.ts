import { createApi } from "./app.js";
import { createService } from "./wiring.js";

/** Lambda entry point behind the HTTP API (`/documents`). */
export const handler = createApi(createService());
