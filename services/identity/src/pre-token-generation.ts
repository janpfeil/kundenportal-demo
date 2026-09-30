import type { PreTokenGenerationV2TriggerEvent } from "aws-lambda";
import { originOf } from "@kundenportal/events";
import { isPassTenant, TenantDirectory, type TenantStatusLookup } from "@kundenportal/service-kit";
import { type Announce, DEFAULT_TENANT } from "./announce.js";
import { LEGACY_REF_ATTRIBUTE, parseLegacyRef } from "./legacy-account.js";

export { DEFAULT_TENANT };

/**
 * Cognito "pre token generation" trigger (event version 2).
 *
 * Adds the claims the API needs to the access token, so the services stay independent
 * of the identity provider: `tenant_id`, `email`, `locale`, `name` and, for accounts
 * taken over from a legacy system, `origin` (`legacy-utility`, `legacy-telco`). Any other OIDC provider
 * can be plugged in by issuing the same claims (e.g. an Auth0 Action).
 *
 * An account of a demo pass whose pass is no longer usable gets no token: throwing makes
 * Cognito refuse the sign-in and every token refresh. A pass that used up its quota
 * still signs in, so the shell can show why the API answers 429.
 *
 * With an announcer it also announces a lazily migrated account (see `createAnnouncer`);
 * that never delays or fails the token beyond the announcer's own deadline.
 */
export function createHandler(
  announce?: Announce,
  tenants: TenantStatusLookup = new TenantDirectory(),
) {
  return async (
    event: PreTokenGenerationV2TriggerEvent,
  ): Promise<PreTokenGenerationV2TriggerEvent> => {
    const attributes = event.request.userAttributes;
    const tenantId = attributes["custom:tenant_id"] || DEFAULT_TENANT;
    if (isPassTenant(tenantId)) {
      const status = await tenants.status(tenantId);
      if (status !== "active" && status !== "quota-exceeded") {
        throw new Error("Der Demo-Pass ist nicht mehr gültig");
      }
    }
    if (announce) await announce(attributes);
    const claims: Record<string, string> = { tenant_id: tenantId };
    if (attributes.email && attributes.email_verified === "true") claims.email = attributes.email;
    if (attributes.locale) claims.locale = attributes.locale;
    if (attributes.name) claims.name = attributes.name;
    const legacy = parseLegacyRef(attributes[LEGACY_REF_ATTRIBUTE]);
    if (legacy) claims.origin = originOf(legacy.system);

    event.response = {
      claimsAndScopeOverrideDetails: {
        accessTokenGeneration: { claimsToAddOrOverride: claims },
      },
    };
    return event;
  };
}

/** Claims only (tests and pools without migration). */
export const handler = createHandler();
