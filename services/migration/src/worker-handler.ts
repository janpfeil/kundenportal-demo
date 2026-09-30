import { createWorker } from "./worker.js";
import { createUseCases } from "./wiring.js";

/** Lambda entry point for the EventBridge rule (every event of the own bus). */
const { bulk, linking, cockpit } = createUseCases();
export const handler = createWorker(bulk, linking, cockpit);
