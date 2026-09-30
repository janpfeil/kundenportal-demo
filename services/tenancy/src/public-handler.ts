import { createPublicApi } from "./api.js";
import { createPublicUseCases } from "./wiring.js";

/** Lambda entry point of the public routes (`GET /tenancy/challenge`, `POST /tenancy/redeem`). */
const { passes, altcha, repository, config } = createPublicUseCases();
export const handler = createPublicApi(passes, altcha, repository, config);
