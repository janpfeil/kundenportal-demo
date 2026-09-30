import { SSMClient } from "@aws-sdk/client-ssm";
import type { UserMigrationTriggerEvent } from "aws-lambda";
import {
  isPassTenant,
  log,
  OWNER_TENANT,
  TenantDirectory,
  type TenantStatusLookup,
} from "@kundenportal/service-kit";
import { cachedLegacyAccess, type LegacyAccess } from "@kundenportal/legacy";
import {
  authenticateLegacy,
  findLegacyByEmail,
  formatLegacyRef,
  LEGACY_REF_ATTRIBUTE,
  MIGRATION_MODE_ATTRIBUTE,
} from "./legacy-account.js";

/** User attribute that binds an account to its tenant; Cognito lets it be set only once. */
export const TENANT_ATTRIBUTE = "custom:tenant_id";

/** Tenant of a sign-in name and the address its legacy account is known by. */
export interface SignInTarget {
  tenantId: string;
  /** Address in the tenant's legacy systems (without the plus suffix). */
  legacyEmail: string;
}

/**
 * Demo persons of a pass tenant sign in with a plus address naming the tenant, e.g.
 * `anna.becker+p4k7x2qa@example.org` (architektur-mandanten §2). The suffix counts only if
 * it is a pass tenant that is active right now; anything else is the owner's, unchanged.
 */
export async function signInTarget(
  userName: string,
  tenants: TenantStatusLookup,
): Promise<SignInTarget> {
  const email = userName.trim().toLowerCase();
  const match = /^([^@+]+)\+([^@+]+)@([^@]+)$/.exec(email);
  const tag = match?.[2];
  if (match && tag && isPassTenant(tag) && (await tenants.isActive(tag))) {
    return { tenantId: tag, legacyEmail: `${match[1]}@${match[3]}` };
  }
  return { tenantId: OWNER_TENANT, legacyEmail: email };
}

/**
 * Cognito "migrate user" trigger (lazy migration, journey J2). Cognito calls it when a
 * sign-in or a password reset names a user the pool does not know yet. The trigger
 * checks the password at the legacy systems (utility REST with bcrypt, telco Keycloak or,
 * for a demo pass, the telco system itself); if it matches, Cognito creates the user with
 * the returned attributes and stores the password it already has — the hash never leaves
 * the legacy system. A demo pass's account keeps its plus address and is bound to the
 * pass tenant for good.
 *
 * Throwing makes Cognito answer "incorrect username or password".
 */
export function createHandler(
  getAccess: () => Promise<LegacyAccess>,
  tenants: TenantStatusLookup = new TenantDirectory(),
) {
  return async (event: UserMigrationTriggerEvent): Promise<UserMigrationTriggerEvent> => {
    const { tenantId, legacyEmail } = await signInTarget(event.userName, tenants);
    const legacy = await getAccess();

    const found =
      event.triggerSource === "UserMigration_Authentication"
        ? await authenticateLegacy(legacy, tenantId, legacyEmail, event.request.password)
        : await findLegacyByEmail(legacy, tenantId, legacyEmail);
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

    const pass = tenantId !== OWNER_TENANT;
    event.response.userAttributes = {
      // A pass's demo person keeps the plus address it signed in with.
      email: pass ? event.userName.trim().toLowerCase() : found.email,
      email_verified: "true",
      name: found.displayName,
      locale: "de",
      [LEGACY_REF_ATTRIBUTE]: formatLegacyRef(found.account),
      [MIGRATION_MODE_ATTRIBUTE]: "lazy",
      ...(pass ? { [TENANT_ATTRIBUTE]: tenantId } : {}),
    };
    // Sign-in: the password is proven, the account is ready. Reset: Cognito sends the
    // code to the verified address. No welcome mail either way.
    if (event.triggerSource === "UserMigration_Authentication") {
      event.response.finalUserStatus = "CONFIRMED";
    }
    event.response.messageAction = "SUPPRESS";
    log("info", "Legacy account taken over", {
      tenantId,
      account: formatLegacyRef(found.account),
      trigger: event.triggerSource,
    });
    return event;
  };
}

export const handler = createHandler(cachedLegacyAccess(new SSMClient({})));
