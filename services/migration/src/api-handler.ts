import { createHandler } from "./api.js";
import { createUseCases } from "./wiring.js";

/** Lambda entry point of the API (`/me/links`, `/migration/*`). */
const { bulk, linking, cockpit } = createUseCases();
export const handler = createHandler(bulk, linking, cockpit);
