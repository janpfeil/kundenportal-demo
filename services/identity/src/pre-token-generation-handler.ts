import { createHandler } from "./pre-token-generation.js";
import { createAnnouncerFromEnvironment } from "./wiring.js";

/** Lambda entry of the pre token generation trigger (claims plus lazy-migration announcement). */
export const handler = createHandler(createAnnouncerFromEnvironment());
