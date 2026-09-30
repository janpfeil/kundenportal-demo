import type { PostAuthenticationTriggerEvent } from "aws-lambda";
import { customerIdFor, deterministicUuid, originOf } from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import type { AnnouncementRepository } from "./announcements.js";
import type { LegacyAccess } from "@kundenportal/legacy";
import {
  formatLegacyRef,
  LEGACY_REF_ATTRIBUTE,
  MIGRATION_MODE_ATTRIBUTE,
  parseLegacyRef,
  readLegacy,
} from "./legacy-account.js";
import { DEFAULT_TENANT } from "./pre-token-generation.js";
import type { IdentityEvents } from "./publisher.js";

export interface PostAuthenticationDeps {
  access: () => Promise<LegacyAccess>;
  announcements: AnnouncementRepository;
  events: IdentityEvents;
  now?: () => Date;
}

/**
 * Cognito "post authentication" trigger. After the first sign-in of a lazily migrated
 * account it publishes `LegacyAccountMigrated` with master data and contracts — only
 * here the new identity's `sub` is known. Customer, contract and migration domain react.
 *
 * It never fails the sign-in: if publishing fails, the next sign-in tries again (the
 * event id is derived from the legacy account, so consumers see a repeat as the same event).
 */
export function createHandler(deps: PostAuthenticationDeps) {
  return async (event: PostAuthenticationTriggerEvent): Promise<PostAuthenticationTriggerEvent> => {
    const attributes = event.request.userAttributes;
    const account = parseLegacyRef(attributes[LEGACY_REF_ATTRIBUTE]);
    const subject = attributes.sub;
    if (!account || !subject || attributes[MIGRATION_MODE_ATTRIBUTE] !== "lazy") return event;
    const tenantId = attributes["custom:tenant_id"] || DEFAULT_TENANT;
    try {
      if (await deps.announcements.announced(tenantId, subject)) return event;
      const mapped = await readLegacy(await deps.access(), tenantId, account);
      if (!mapped?.ok) {
        log("warn", "Migrated account no longer readable in the legacy system", {
          account: formatLegacyRef(account),
        });
        return event;
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
    return event;
  };
}
