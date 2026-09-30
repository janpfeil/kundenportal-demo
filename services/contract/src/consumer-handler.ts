import { createConsumer } from "./consumer.js";
import { createService } from "./wiring.js";

/** Lambda entry point behind the contract queue (domain events from EventBridge). */
export const handler = createConsumer(createService());
