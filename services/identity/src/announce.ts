import { customerIdFor, deterministicUuid, originOf } from "@kundenportal/events";
import type { LegacyAccess } from "@kundenportal/legacy";
import { log } from "@kundenportal/service-kit";
import type { AnnouncementRepository } from "./announcements.js";
import {
  formatLegacyRef,
  LEGACY_REF_ATTRIBUTE,
  MIGRATION_MODE_ATTRIBUTE,
  parseLegacyRef,
  readLegacy,
} from "./legacy-account.js";
import type { IdentityEvents } from "./publisher.js";

/** Tenant of every account in phase 1; demo passes add further tenants in phase 4. */
export const DEFAULT_TENANT = "owner";

export interface AnnouncerDeps {
  access: () => Promise<LegacyAccess>;
  announcements: AnnouncementRepository;
  events: IdentityEvents;
  now?: () => Date;
}

export type Announce = (attributes: Record<string, string | undefined>) => Promise<void>;

/**
 * Publishes `LegacyAccountMigrated` once for a lazily migrated account, with master
 * data and contracts — only after the migrate user trigger is the new identity's `sub`
 * known. Both the post authentication and the pre token generation trigger call it:
 * the AWS documentation does not say which of them fires on the sign-in that migrates
 * the user, so whichever comes first announces, the marker stops the other.
 *
 * It never throws: a failed attempt is retried at the next sign-in or token refresh
 * (the event id is derived from the legacy account, so a repeat is the same event).
 */
export function createAnnouncer(deps: AnnouncerDeps): Announce {
  return async (attributes) => {
    const account = parseLegacyRef(attributes[LEGACY_REF_ATTRIBUTE]);
    const subject = attributes.sub;
    if (!account || !subject || attributes[MIGRATION_MODE_ATTRIBUTE] !== "lazy") return;
    const tenantId = attributes["custom:tenant_id"] || DEFAULT_TENANT;
    try {
      if (await deps.announcements.announced(tenantId, subject)) return;
      const mapped = await readLegacy(await deps.access(), tenantId, account);
      if (!mapped?.ok) {
        log("warn", "Migrated account no longer readable in the legacy system", {
          account: formatLegacyRef(account),
        });
        return;
      }
      const eventId = deterministicUuid(
        tenantId,
        "LegacyAccountMigrated",
        formatLegacyRef(account),
      );
      const occurredAt = (deps.now?.() ?? new Date()).toISOString();
      await deps.events.legacyAccountMigrated({
        eventId,
        tenantId,
        occurredAt,
        correlationId: eventId,
        payload: {
          customerId: customerIdFor(tenantId, subject),
          subject,
          email: attributes.email ?? mapped.email,
          displayName: attributes.name ?? mapped.displayName,
          locale: attributes.locale === "en" ? "en" : "de",
          account,
          mode: "lazy",
          passwordMigrated: true,
          profile: mapped.profile,
          contracts: mapped.contracts,
        },
      });
      await deps.announcements.markAnnounced(tenantId, subject, eventId, occurredAt);
      log("info", "Lazy migration announced", {
        account: formatLegacyRef(account),
        origin: originOf(account.system),
      });
    } catch (error) {
      log("error", "Announcing the lazy migration failed; retried at next sign-in", {
        account: formatLegacyRef(account),
        error: (error as Error).message,
      });
    }
  };
}
