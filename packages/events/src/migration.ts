import { z } from "zod";
import { Cents, Division, IsoDate, MeterUnit } from "./contract.js";
import { type CustomerOrigin, Locale } from "./customer.js";
import { deterministicUuid } from "./delivery.js";
import { EventSource, eventDetailSchema } from "./envelope.js";

/** The two legacy systems whose customers the portal takes over. */
export const LegacySystem = z.enum(["utility", "telco"]);
export type LegacySystem = z.infer<typeof LegacySystem>;

/** Origin of a customer account taken over from a legacy system. */
export function originOf(system: LegacySystem): CustomerOrigin {
  return system === "utility" ? "legacy-utility" : "legacy-telco";
}

/**
 * Customer id of the account a sign-in identity belongs to. Migrated accounts get it
 * before the customer first opens the portal, so every domain derives the same id
 * from the identity instead of waiting for the customer domain.
 */
export function customerIdFor(tenantId: string, subject: string): string {
  return deterministicUuid(tenantId, "customer", subject);
}

/** A customer account in a legacy system, e.g. `utility` / `V-1000123` or `telco` / `T/88-4711`. */
export const LegacyAccountRef = z.object({
  system: LegacySystem,
  customerNumber: z.string().min(1),
});
export type LegacyAccountRef = z.infer<typeof LegacyAccountRef>;

/** Postal address after normalisation (street and house number split, abbreviations expanded). */
export const PostalAddress = z.object({
  street: z.string().min(1),
  houseNumber: z.string().min(1),
  postalCode: z.string().regex(/^\d{5}$/),
  city: z.string().min(1),
});
export type PostalAddress = z.infer<typeof PostalAddress>;

/** Master data taken over from a legacy system. */
export const LegacyProfile = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  address: PostalAddress,
  /** As stored in the legacy system; may be outdated. */
  phone: z.string().min(1).optional(),
  birthDate: IsoDate.optional(),
});
export type LegacyProfile = z.infer<typeof LegacyProfile>;

/**
 * A contract as the legacy system knew it, already mapped to the portal's divisions and
 * tariff options. The contract domain creates its own contract from it.
 */
export const LegacyContract = z.object({
  /** Contract number in the legacy system. */
  legacyContractId: z.string().min(1),
  division: Division,
  /** Portal tariff option the legacy tariff maps to (see the contract domain's catalogue). */
  tariffOption: z.string().min(1),
  monthlyInstallmentCent: Cents,
  meterNumber: z.string().min(1).optional(),
  unit: MeterUnit.optional(),
  /** Last meter reading the legacy system billed, as reference for the next estimate. */
  lastReading: z.object({ value: z.number().nonnegative(), readAt: IsoDate }).optional(),
  dataVolumeMb: z.number().int().positive().optional(),
  startDate: IsoDate,
});
export type LegacyContract = z.infer<typeof LegacyContract>;

/** How an account came over: at its first sign-in (lazy) or by a bulk import. */
export const MigrationMode = z.enum(["lazy", "bulk"]);
export type MigrationMode = z.infer<typeof MigrationMode>;

/**
 * A legacy account became a portal account. Carries the master data and the contracts
 * (event-carried state transfer): the customer domain creates the profile, the contract
 * domain the contracts, the migration domain counts it. Two domains publish it: identity
 * at the first sign-in (lazy), migration in a bulk import; consumers match both sources.
 */
export const LegacyAccountMigrated = {
  sources: [EventSource.identity, EventSource.migration],
  detailType: "LegacyAccountMigrated",
  detail: eventDetailSchema(
    z.object({
      /** `customerIdFor(tenantId, subject)`. */
      customerId: z.string().min(1),
      subject: z.string().min(1),
      email: z.email(),
      displayName: z.string().min(1),
      locale: Locale,
      account: LegacyAccountRef,
      mode: MigrationMode,
      /** False if the customer has to choose a new password (hash not transferable). */
      passwordMigrated: z.boolean(),
      profile: LegacyProfile,
      contracts: z.array(LegacyContract),
    }),
  ),
} as const;
export type LegacyAccountMigratedDetail = z.infer<typeof LegacyAccountMigrated.detail>;

/** Why two accounts are believed to belong to the same person. */
export const MatchCriterion = z.enum(["name", "address", "birthDate", "email", "phone"]);
export type MatchCriterion = z.infer<typeof MatchCriterion>;

/**
 * A legacy account in the other system probably belongs to a portal customer.
 * The customer receives an offer to link it.
 */
export const DuplicateCandidateFound = {
  source: EventSource.migration,
  detailType: "DuplicateCandidateFound",
  detail: eventDetailSchema(
    z.object({
      customerId: z.string().min(1),
      subject: z.string().min(1),
      /** The portal customer's own legacy account. */
      account: LegacyAccountRef,
      candidate: LegacyAccountRef,
      /** Shown in the offer, e.g. `Hauptstraße 5, 12345 Musterstadt`. */
      candidateSummary: z.object({ displayName: z.string().min(1), address: z.string().min(1) }),
      matchedOn: z.array(MatchCriterion).min(1),
      /** Between 0 and 1. */
      score: z.number().min(0).max(1),
    }),
  ),
} as const;
export type DuplicateCandidateFoundDetail = z.infer<typeof DuplicateCandidateFound.detail>;

/** The customer confirmed the link; the linked account's contracts move to this customer. */
export const AccountsLinked = {
  source: EventSource.migration,
  detailType: "AccountsLinked",
  detail: eventDetailSchema(
    z.object({
      customerId: z.string().min(1),
      subject: z.string().min(1),
      account: LegacyAccountRef,
      linked: LegacyAccountRef,
      contracts: z.array(LegacyContract),
    }),
  ),
} as const;
export type AccountsLinkedDetail = z.infer<typeof AccountsLinked.detail>;

/** Counters of a bulk migration run. */
export const BulkMigrationCounts = z.object({
  /** Records read from the export. */
  read: z.number().int().nonnegative(),
  migrated: z.number().int().nonnegative(),
  /** Active accounts are left to the lazy migration. */
  skippedActive: z.number().int().nonnegative(),
  alreadyMigrated: z.number().int().nonnegative(),
  /** Records a person has to look at (e.g. no email address). */
  clarification: z.number().int().nonnegative(),
  /** Records that went to the dead-letter queue. */
  failed: z.number().int().nonnegative(),
});
export type BulkMigrationCounts = z.infer<typeof BulkMigrationCounts>;

export const BulkMigrationStarted = {
  source: EventSource.migration,
  detailType: "BulkMigrationStarted",
  detail: eventDetailSchema(
    z.object({
      runId: z.string().min(1),
      system: LegacySystem,
      /** Accounts without sign-in for at least this many months count as inactive. */
      inactiveMonths: z.number().int().positive(),
      /** Subject of the owner who started the run. */
      startedBy: z.string().min(1),
    }),
  ),
} as const;
export type BulkMigrationStartedDetail = z.infer<typeof BulkMigrationStarted.detail>;

export const BulkMigrationCompleted = {
  source: EventSource.migration,
  detailType: "BulkMigrationCompleted",
  detail: eventDetailSchema(
    z.object({
      runId: z.string().min(1),
      system: LegacySystem,
      counts: BulkMigrationCounts,
    }),
  ),
} as const;
export type BulkMigrationCompletedDetail = z.infer<typeof BulkMigrationCompleted.detail>;

/** Why a migrated account has no usable password. */
export const PasswordResetReason = z.enum(["hash-not-transferable", "hash-import-unavailable"]);

/** A bulk-migrated customer must choose a new password; the mailbox receives the request. */
export const PasswordResetRequired = {
  source: EventSource.migration,
  detailType: "PasswordResetRequired",
  detail: eventDetailSchema(
    z.object({
      customerId: z.string().min(1),
      subject: z.string().min(1),
      email: z.email(),
      account: LegacyAccountRef,
      reason: PasswordResetReason,
    }),
  ),
} as const;
export type PasswordResetRequiredDetail = z.infer<typeof PasswordResetRequired.detail>;

/** Machine-readable reason a legacy record could not be migrated. */
export const MigrationFailureCode = z.enum([
  "missing-required-field",
  "invalid-field",
  "legacy-unavailable",
  "identity-conflict",
  "unexpected",
]);
export type MigrationFailureCode = z.infer<typeof MigrationFailureCode>;

/** A legacy record ended in the dead-letter queue; the cockpit offers a redrive. */
export const MigrationRecordFailed = {
  source: EventSource.migration,
  detailType: "MigrationRecordFailed",
  detail: eventDetailSchema(
    z.object({
      account: LegacyAccountRef,
      runId: z.string().min(1).optional(),
      code: MigrationFailureCode,
      /** Human-readable detail, e.g. the field that is empty. */
      message: z.string().min(1),
      /** Fields concerned, e.g. `["postalCode"]`. */
      fields: z.array(z.string().min(1)),
      /** Processing attempts so far, including redrives. */
      attempts: z.number().int().positive(),
    }),
  ),
} as const;
export type MigrationRecordFailedDetail = z.infer<typeof MigrationRecordFailed.detail>;
