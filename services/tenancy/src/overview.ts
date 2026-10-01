import { lastGermanDays } from "@kundenportal/service-kit";
import type { TenancyContext } from "./context.js";
import { INVITATION_DAYS, type InvitationIndexEntry, type PlatformTenant } from "./model.js";

/** Days of the API call course (`apiCalls.days`). */
export const API_CALL_DAYS = 7;

/** `GET /tenancy/overview` (`PassOverview` in the contract). */
export interface PassOverview {
  activeTenants: number;
  maxTenants: number;
  openInvitations: number;
  neverSignedIn: number;
  reminderHours: number;
  invitationDays: number;
  invitations: InvitationIndexEntry[];
  apiCalls: { today: number; days: { date: string; calls: number }[] };
}

/**
 * A pass whose holder has not signed in yet: the tenant is `active` (set up, the holder
 * got the invitation mail) and has no `activatedAt`. A tenant still `provisioning` is
 * left out — its holder has no account yet, so there is nothing to sign in to;
 * `quota-exceeded` implies calls, so a sign-in, and ended passes no longer matter.
 */
export const neverSignedIn = (tenant: PlatformTenant) =>
  tenant.status === "active" && tenant.activatedAt === undefined;

/**
 * Key figures of the owner's pass administration: tenants against the cap (as in the
 * settings), the open invitations from their index, holders who never signed in, and
 * the API calls of all pass tenants over the last seven German days, summed from the
 * quota guard's day counters. Deleted tenants have no counters any more and are skipped.
 *
 * Reads: the settings item, one query each of the tenant and the invitation entries of
 * `PLATFORM`, and one projected item read per tenant that is not deleted (at most
 * `MAX_TENANTS_LIMIT`, 4) — no writes.
 */
export async function passOverview(ctx: TenancyContext): Promise<PassOverview> {
  const { repository, config } = ctx;
  const now = ctx.now();
  const days = lastGermanDays(now, API_CALL_DAYS);
  const [settings, tenants, invitations] = await Promise.all([
    repository.getSettings(),
    repository.listTenants(),
    repository.listOpenInvitations(now),
  ]);
  const counted = tenants.filter((tenant) => tenant.status !== "deleted");
  const perTenant = await Promise.all(
    counted.map((tenant) => repository.getApiCalls(tenant.tenantId, days)),
  );
  const calls = days.map((date) => ({
    date,
    calls: perTenant.reduce((sum, tenant) => sum + (tenant[date] ?? 0), 0),
  }));
  return {
    activeTenants: Math.max(0, settings.activeTenants ?? 0),
    maxTenants: settings.maxTenants,
    openInvitations: invitations.length,
    neverSignedIn: tenants.filter(neverSignedIn).length,
    reminderHours: config.reminderHours,
    invitationDays: INVITATION_DAYS,
    invitations,
    apiCalls: { today: calls.at(-1)?.calls ?? 0, days: calls },
  };
}
