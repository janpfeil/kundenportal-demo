/*
 * What the cockpit's overview derives from GET /migration/status: progress per legacy
 * system, the key figures with their changes, the problem of a record in words and the
 * status badges. Free of server APIs, so components and tests use it alike.
 */

import type { MigrationStatus } from "@kundenportal/api-contract";
import type { StatusTone } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";

export type SystemStatus = MigrationStatus["systems"][number];
export type RecordView = MigrationStatus["deadLetters"][number];
export type Run = MigrationStatus["runs"][number];
export type Entry = MigrationStatus["timeline"][number];
export type LegacySystem = SystemStatus["system"];
export type RecordStatus = RecordView["status"];

export interface Progress {
  system: LegacySystem;
  /** Migrated plus linked records. */
  done: number;
  /** Records in the legacy system; undefined while it is unreachable. */
  total: number | undefined;
  /** Whole percent of the total (0 without a total). */
  percent: number;
  today: number;
}

/** Progress of one legacy system: what is done of what exists, and what was done today. */
export function progressOf(system: SystemStatus): Progress {
  const done = (system.counts.migrated ?? 0) + (system.counts.linked ?? 0);
  const total = system.total;
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return { system: system.system, done, total, percent, today: system.migratedToday ?? 0 };
}

export interface Delta {
  text: string;
  tone: "good" | "bad" | "neutral";
}

/** "+3 seit gestern": new clarification cases are unwelcome, none is neutral. */
export function clarificationDelta(trends: MigrationStatus["trends"], template: string): Delta {
  const count = trends.newClarifications;
  return { text: fill(template, { count }), tone: count > 0 ? "bad" : "neutral" };
}

/** "−2 nach Redrive": every redriven dead letter is welcome, none is neutral. */
export function redriveDelta(trends: MigrationStatus["trends"], template: string): Delta {
  const count = trends.redriven;
  return { text: fill(template, { count }), tone: count > 0 ? "good" : "neutral" };
}

/** Badge colour of a record status (search results). */
export const RECORD_TONES: Record<RecordStatus, StatusTone> = {
  "pending-lazy": "neutral",
  queued: "info",
  migrated: "ok",
  linked: "ok",
  clarification: "warn",
  failed: "err",
};

/** Where the overview lists a record of this status, if anywhere. */
export function recordAnchor(status: RecordStatus): string | undefined {
  if (status === "clarification") return "?klaerfaelle=alle#klaerfaelle";
  if (status === "failed") return "#dlq";
  return undefined;
}

export interface ProblemTexts {
  /** No e-mail address in the legacy system. */
  missingEmail: string;
  /** An e-mail address that is not one. */
  invalidEmail: string;
  /** One field missing, e.g. "{field} fehlt". */
  missingOne: string;
  /** Several fields missing, e.g. "Pflichtangaben fehlen: {fields}". */
  missingMany: string;
  invalidOne: string;
  invalidMany: string;
  unavailable: string;
  conflict: string;
  unexpected: string;
  /** Names of the fields the legacy mapping reports. */
  fields: Record<string, string>;
}

/**
 * The problem of a clarification case or dead letter in words, from its code and fields
 * (the service's message is technical English; the page shows it as tooltip).
 */
export function problemText(
  record: Pick<RecordView, "code" | "fields" | "message">,
  texts: ProblemTexts,
): string {
  const fields = record.fields ?? [];
  const names = fields.map((field) => texts.fields[field] ?? field);
  const list = names.join(", ");
  switch (record.code) {
    case "missing-required-field":
      if (fields.length === 1 && fields[0] === "email") return texts.missingEmail;
      if (names.length === 1) return fill(texts.missingOne, { field: list });
      if (names.length > 1) return fill(texts.missingMany, { fields: list });
      break;
    case "invalid-field":
      if (fields.length === 1 && fields[0] === "email") return texts.invalidEmail;
      if (names.length === 1) return fill(texts.invalidOne, { field: list });
      if (names.length > 1) return fill(texts.invalidMany, { fields: list });
      break;
    case "legacy-unavailable":
      return texts.unavailable;
    case "identity-conflict":
      return texts.conflict;
    case "unexpected":
      return texts.unexpected;
  }
  return record.message || texts.unexpected;
}

/** Number of clarification cases the overview shows before "Alle anzeigen". */
export const CLARIFICATIONS_SHOWN = 5;
