import { createWorker } from "./worker.js";
import { createService } from "./wiring.js";

/** Lambda entry point for EventBridge rules and the daily data volume schedule. */
export const handler = createWorker(createService());
