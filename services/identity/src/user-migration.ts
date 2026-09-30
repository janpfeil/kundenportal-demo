import { SSMClient } from "@aws-sdk/client-ssm";
import type { UserMigrationTriggerEvent } from "aws-lambda";
import { log } from "@kundenportal/service-kit";
import { cachedLegacyAccess, type LegacyAccess } from "@kundenportal/legacy";
import {
  authenticateLegacy,
  findLegacyByEmail,
  formatLegacyRef,
  LEGACY_REF_ATTRIBUTE,
  MIGRATION_MODE_ATTRIBUTE,
} from "./legacy-account.js";
import { DEFAULT_TENANT } from "./announce.js";

/**
 * Cognito "migrate user" trigger (lazy migration, journey J2). Cognito calls it when a
 * sign-in or a password reset names a user the pool does not know yet. The trigger
 * checks the password at the legacy systems (utility REST with bcrypt, telco Keycloak);
 * if it matches, Cognito creates the user with the returned attributes and stores the
 * password it already has — the hash never leaves the legacy system.
 *
 * Throwing makes Cognito answer "incorrect username or password".
 */
export function createHandler(getAccess: () => Promise<LegacyAccess>) {
  return async (event: UserMigrationTriggerEvent): Promise<UserMigrationTriggerEvent> => {
    // Phase 4 gives every demo pass its own tenant; until then all users are the owner's.
    const tenantId = DEFAULT_TENANT;
    const email = event.userName.trim().toLowerCase();
    const legacy = await getAccess();

    const found =
      event.triggerSource === "UserMigration_Authentication"
        ? await authenticateLegacy(legacy, tenantId, email, event.request.password)
        : await findLegacyByEmail(legacy, tenantId, email);
    if (!found) throw new Error("Bad credentials");
    if (!found.ok) {
      // E.g. no or an invalid email address: a clarification case, no portal account.
      log("warn", "Legacy account cannot be migrated", {
        account: formatLegacyRef(found.account),
        code: found.code,
        fields: found.fields,
      });
      throw new Error("Bad credentials");
    }

    event.response.userAttributes = {
      email: found.email,
      email_verified: "true",
      name: found.displayName,
      locale: "de",
      [LEGACY_REF_ATTRIBUTE]: formatLegacyRef(found.account),
      [MIGRATION_MODE_ATTRIBUTE]: "lazy",
    };
    // Sign-in: the password is proven, the account is ready. Reset: Cognito sends the
    // code to the verified address. No welcome mail either way.
    if (event.triggerSource === "UserMigration_Authentication") {
      event.response.finalUserStatus = "CONFIRMED";
    }
    event.response.messageAction = "SUPPRESS";
    log("info", "Legacy account taken over", {
      account: formatLegacyRef(found.account),
      trigger: event.triggerSource,
    });
    return event;
  };
}

export const handler = createHandler(cachedLegacyAccess(new SSMClient({})));
