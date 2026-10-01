/*
 * How the cockpit shows domain events in its timeline: an icon and a colour per event type
 * (packages/events/src), the German or English title from the dictionary, and the system of
 * a bulk import from the entry's summary ("telco", "utility").
 */

import type { IconName } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";

export type EventTone = "ok" | "warn" | "err" | "neutral";

export interface EventLook {
  icon: IconName;
  tone: EventTone;
}

/** Every event type the portal publishes (EventBridge `detail-type`). */
export const EVENT_TYPES = [
  "LegacyAccountMigrated",
  "MigrationRecordFailed",
  "AccountsLinked",
  "BulkMigrationStarted",
  "BulkMigrationCompleted",
  "DuplicateCandidateFound",
  "PasswordResetRequired",
  "MigratedAccountsRemoved",
  "MeterReadingSubmitted",
  "DataVolumeThresholdReached",
  "ContractChanged",
  "InstallmentAdjusted",
  "CustomerRegistered",
  "DocumentUploaded",
  "InvitationCreated",
  "DemoPassIssued",
  "TenantProvisioned",
  "QuotaExceeded",
  "DemoPassExpired",
  "TenantDeleted",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const LOOKS: Record<EventType, EventLook> = {
  LegacyAccountMigrated: { icon: "check", tone: "ok" },
  MigrationRecordFailed: { icon: "x", tone: "err" },
  AccountsLinked: { icon: "link", tone: "neutral" },
  BulkMigrationStarted: { icon: "upload", tone: "neutral" },
  BulkMigrationCompleted: { icon: "upload", tone: "ok" },
  DuplicateCandidateFound: { icon: "alert", tone: "warn" },
  PasswordResetRequired: { icon: "key", tone: "neutral" },
  MigratedAccountsRemoved: { icon: "refresh", tone: "neutral" },
  MeterReadingSubmitted: { icon: "bolt", tone: "ok" },
  DataVolumeThresholdReached: { icon: "alert", tone: "warn" },
  ContractChanged: { icon: "file", tone: "neutral" },
  InstallmentAdjusted: { icon: "file", tone: "neutral" },
  CustomerRegistered: { icon: "user", tone: "neutral" },
  DocumentUploaded: { icon: "upload", tone: "neutral" },
  InvitationCreated: { icon: "ticket", tone: "neutral" },
  DemoPassIssued: { icon: "ticket", tone: "neutral" },
  TenantProvisioned: { icon: "ticket", tone: "ok" },
  QuotaExceeded: { icon: "ticket", tone: "warn" },
  DemoPassExpired: { icon: "ticket", tone: "neutral" },
  TenantDeleted: { icon: "ticket", tone: "neutral" },
};

const FALLBACK: EventLook = { icon: "info", tone: "neutral" };

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

/** Icon and colour of an event type; an unknown type gets the info icon. */
export function eventLook(detailType: string): EventLook {
  return isEventType(detailType) ? LOOKS[detailType] : FALLBACK;
}

export interface EventTexts {
  titles: Record<EventType, string>;
  /** Title of an unknown type. */
  fallback: string;
  /** E.g. "Bulk-Import {system} gestartet". */
  bulkStarted: string;
  bulkCompleted: string;
}

/**
 * Title of a timeline entry in words. A bulk import names its legacy system when the
 * summary carries it (the migration service writes "telco" or "utility" there).
 */
export function eventTitle(
  detailType: string,
  summary: string,
  texts: EventTexts,
  systems: Record<"utility" | "telco", string>,
): string {
  if (detailType === "BulkMigrationStarted" || detailType === "BulkMigrationCompleted") {
    const system = summary.split(/\s+/).find((word) => word === "utility" || word === "telco");
    if (system) {
      const template =
        detailType === "BulkMigrationStarted" ? texts.bulkStarted : texts.bulkCompleted;
      return fill(template, { system: systems[system] });
    }
  }
  return isEventType(detailType) ? texts.titles[detailType] : texts.fallback;
}
