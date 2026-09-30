import { createProcessor } from "./worker.js";
import { createUseCases } from "./wiring.js";

/** Lambda entry point of the record processor (asynchronous invocations, DLQ on failure). */
export const handler = createProcessor(createUseCases().bulk);
