import type { LegacyAccountRef, LegacySystem } from "@kundenportal/events";
import { type MappingResult, mapTelcoSubscriber, mapUtilityCustomer } from "@kundenportal/legacy";
import { log } from "@kundenportal/service-kit";
import type { LegacyAccess } from "@kundenportal/legacy";

/** User attribute that records which legacy account a Cognito user came from. */
export const LEGACY_REF_ATTRIBUTE = "custom:legacy_ref";
/** User attribute `lazy` or `bulk`: how the account came over. */
export const MIGRATION_MODE_ATTRIBUTE = "custom:migration_mode";

/** `utility:V-1000123`, `telco:T/88-4711`. */
export function formatLegacyRef(account: LegacyAccountRef): string {
  return `${account.system}:${account.customerNumber}`;
}

export function parseLegacyRef(value: string | undefined): LegacyAccountRef | undefined {
  const match = /^(utility|telco):(.+)$/.exec(value ?? "");
  return match
    ? { system: match[1] as LegacySystem, customerNumber: match[2] as string }
    : undefined;
}

/**
 * Finds the legacy account whose password matches: the utility checks its bcrypt hash,
 * the telco's Keycloak realm checks telco customers. Both run in parallel to stay within
 * Cognito's 5 seconds; the utility wins if both accept (duplicates are linked later).
 */
export async function authenticateLegacy(
  access: LegacyAccess,
  tenantId: string,
  email: string,
  password: string,
): Promise<MappingResult | undefined> {
  const [utility, telco] = await Promise.allSettled([
    access.utility.verifyLogin(tenantId, email, password),
    access.keycloak.verify(email, password),
  ]);
  if (utility.status === "fulfilled" && utility.value) {
    const kunde = await access.utility.getCustomer(tenantId, utility.value);
    if (kunde) return mapUtilityCustomer(kunde);
  }
  if (telco.status === "fulfilled" && telco.value) {
    const subscriber = telco.value.subscriber_id
      ? await access.telco.getSubscriber(tenantId, telco.value.subscriber_id)
      : await access.telco.findByMail(tenantId, telco.value.email ?? email);
    if (subscriber) return mapTelcoSubscriber(subscriber);
  }
  const failures = [utility, telco].filter((r) => r.status === "rejected");
  if (failures.length === 2) {
    // Neither system answered: an outage must not look like a wrong password in the logs.
    throw new Error(
      `Legacy systems unavailable: ${failures.map((f) => String(f.reason)).join("; ")}`,
    );
  }
  for (const failure of failures)
    log("warn", "Legacy check failed", { error: String(failure.reason) });
  return undefined;
}

/** Looks a legacy account up by email only (forgotten password before the first sign-in). */
export async function findLegacyByEmail(
  access: LegacyAccess,
  tenantId: string,
  email: string,
): Promise<MappingResult | undefined> {
  const [kunde, subscriber] = await Promise.all([
    access.utility.findByEmail(tenantId, email),
    access.telco.findByMail(tenantId, email),
  ]);
  if (kunde) return mapUtilityCustomer(kunde);
  if (subscriber) return mapTelcoSubscriber(subscriber);
  return undefined;
}

/** Reads the current data of a legacy account (post authentication, bulk import). */
export async function readLegacy(
  access: LegacyAccess,
  tenantId: string,
  account: LegacyAccountRef,
): Promise<MappingResult | undefined> {
  if (account.system === "utility") {
    const kunde = await access.utility.getCustomer(tenantId, account.customerNumber);
    return kunde && mapUtilityCustomer(kunde);
  }
  const subscriber = await access.telco.getSubscriber(tenantId, account.customerNumber);
  return subscriber && mapTelcoSubscriber(subscriber);
}
