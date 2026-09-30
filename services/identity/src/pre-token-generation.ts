import type { PreTokenGenerationV2TriggerEvent } from "aws-lambda";
import { originOf } from "@kundenportal/events";
import { LEGACY_REF_ATTRIBUTE, parseLegacyRef } from "./legacy-account.js";

/** Tenant of every account in phase 1; demo passes add further tenants in phase 4. */
export const DEFAULT_TENANT = "owner";

/**
 * Cognito "pre token generation" trigger (event version 2).
 *
 * Adds the claims the API needs to the access token, so the services stay independent
 * of the identity provider: `tenant_id`, `email`, `locale`, `name` and, for accounts
 * taken over from a legacy system, `origin` (`legacy-utility`, `legacy-telco`). Any other OIDC provider
 * can be plugged in by issuing the same claims (e.g. an Auth0 Action).
 */
export async function handler(
  event: PreTokenGenerationV2TriggerEvent,
): Promise<PreTokenGenerationV2TriggerEvent> {
  const attributes = event.request.userAttributes;
  const claims: Record<string, string> = {
    tenant_id: attributes["custom:tenant_id"] || DEFAULT_TENANT,
  };
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
}
