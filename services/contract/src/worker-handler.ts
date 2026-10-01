import { createWorker } from "./worker.js";
import { createDomain } from "./wiring.js";

/** Lambda entry point for EventBridge rules (domain events, invoked asynchronously). */
export const handler = createWorker(createDomain().intake);
