import { createWorker } from "./worker.js";
import { createLifecycleContext } from "./wiring.js";

/** Lambda entry point for EventBridge rules, Scheduler tasks and the budget SNS topic. */
export const handler = createWorker(createLifecycleContext());
