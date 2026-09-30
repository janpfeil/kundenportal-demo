import { createWorker } from "./worker.js";
import { createService } from "./wiring.js";

/** Lambda entry point for S3 upload events and CustomerRegistered (both via EventBridge). */
export const handler = createWorker(createService());
