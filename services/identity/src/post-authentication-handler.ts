import { createHandler } from "./post-authentication.js";
import { createAnnouncerFromEnvironment } from "./wiring.js";

/** Lambda entry of the post authentication trigger. */
export const handler = createHandler(createAnnouncerFromEnvironment());
