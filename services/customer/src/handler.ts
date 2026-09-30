import { createHandler } from "./app.js";
import { createService } from "./wiring.js";

/** Lambda entry point of the API: wires AWS clients once per execution environment. */
export const handler = createHandler(createService());
