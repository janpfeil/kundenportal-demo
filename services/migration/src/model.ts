import {
  BulkMigrationCounts,
  LegacyAccountRef,
  LegacyContract,
  LegacySystem,
  MatchCriterion,
  MigrationFailureCode,
  MigrationMode,
} from "@kundenportal/events";
import { z } from "zod";

/** Accounts without sign-in for at least this long are inactive and bulk-imported. */
export const INACTIVE_MONTHS = 12;

/** Status of one legacy record in the migration (fachkonzept §7.1 `REC#…`). */
export const RecordStatus = z.enum([
  /** Active in the legacy system: waits for the customer's first sign-in (lazy). */
  "pending-lazy",
  /** Queued for the bulk import. */
  "queued",
  "migrated",
  /** Became part of another customer's account (account linking). */
  "linked",
  /** Needs a person (e.g. no email address). */
  "clarification",
  /** Processing failed; the task is in the dead-letter queue. */
  "failed",
]);
export type RecordStatus = z.infer<typeof RecordStatus>;

export const Corrections = z
  .strictObject({
    email: z.email().optional(),
    postalCode: z
      .string()
      .regex(/^\d{5}$/)
      .optional(),
    street: z.string().trim().min(1).max(100).optional(),
    houseNumber: z.string().trim().min(1).max(10).optional(),
    city: z.string().trim().min(1).max(100).optional(),
  })
  .default({});
export type Corrections = z.infer<typeof Corrections>;

export const Problem = z.object({
  code: MigrationFailureCode,
  message: z.string(),
  fields: z.array(z.string()),
});

/** A legacy record as the migration domain tracks it. */
export const MigrationRecord = z.object({
  account: LegacyAccountRef,
  displayName: z.string(),
  status: RecordStatus,
  mode: MigrationMode.optional(),
  customerId: z.string().optional(),
  subject: z.string().optional(),
  lastSignInAt: z.string().optional(),
  runId: z.string().optional(),
  problem: Problem.optional(),
  corrections: Corrections.optional(),
  attempts: z.number().int().nonnegative().default(0),
  updatedAt: z.string(),
});
export type MigrationRecord = z.infer<typeof MigrationRecord>;

/** One bulk import run. */
export const MigrationRun = z.object({
  runId: z.string(),
  system: LegacySystem,
  status: z.enum(["running", "completed"]),
  startedAt: z.string(),
  startedBy: z.string(),
  completedAt: z.string().optional(),
  /** Records handed to the processor; unknown until the export is read. */
  dispatched: z.number().int().nonnegative().optional(),
  processed: z.number().int().nonnegative().default(0),
  counts: BulkMigrationCounts,
});
export type MigrationRun = z.infer<typeof MigrationRun>;

/** Offer to link a second legacy account (`GET /me/links`). */
export const LinkOffer = z.object({
  customerId: z.string(),
  account: LegacyAccountRef,
  candidate: LegacyAccountRef,
  displayName: z.string(),
  address: z.string(),
  matchedOn: z.array(MatchCriterion),
  score: z.number(),
  status: z.enum(["offered", "linked"]),
  offeredAt: z.string(),
  linkedAt: z.string().optional(),
});
export type LinkOffer = z.infer<typeof LinkOffer>;

/** Entry of the cockpit's event timeline (copy of every domain event). */
export const TimelineEntry = z.object({
  eventId: z.string(),
  source: z.string(),
  detailType: z.string(),
  occurredAt: z.string(),
  /** Short, non-personal description, e.g. `utility:V-1000123` or a contract division. */
  summary: z.string(),
});
export type TimelineEntry = z.infer<typeof TimelineEntry>;

/**
 * Work item of the record processor (invoked asynchronously; what fails ends as
 * Lambda on-failure record in the migration DLQ, `requestPayload` = this task).
 */
export const RecordTask = z.object({
  tenantId: z.string(),
  account: LegacyAccountRef,
  runId: z.string().optional(),
  corrections: Corrections.optional(),
  correlationId: z.string(),
});
export type RecordTask = z.infer<typeof RecordTask>;

/** Opaque id of a record in URLs: base64url of `system:customerNumber` (telco ids contain `/`). */
export function recordId(account: LegacyAccountRef): string {
  return Buffer.from(`${account.system}:${account.customerNumber}`).toString("base64url");
}

export function accountFromRecordId(id: string): LegacyAccountRef | undefined {
  const decoded = Buffer.from(id, "base64url").toString();
  const parsed = LegacyAccountRef.safeParse({
    system: decoded.split(":")[0],
    customerNumber: decoded.slice(decoded.indexOf(":") + 1),
  });
  return decoded.includes(":") && parsed.success ? parsed.data : undefined;
}

export const refString = (account: LegacyAccountRef) =>
  `${account.system}:${account.customerNumber}`;

export type { LegacyContract };
