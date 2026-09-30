import { createCleanup } from "./cleanup.js";
import { createLifecycleContext } from "./wiring.js";

/** Lambda entry point of the base stack's custom resource (tears down all pass tenants on delete). */
export const handler = createCleanup(createLifecycleContext());
