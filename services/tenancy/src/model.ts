import { PassEndReason, PassTenantId, QuotaKind } from "@kundenportal/events";
import { z } from "zod";

/** Cognito group of the portal owner (invitations, pass administration). */
export const OWNER_GROUP = "owner";
/** Cognito group of pass holders; the account of the person who redeemed a link. */
export const PASS_GROUP = "pass";
/** Tenant of the portal owner; it has no pass and lives in the base table. */
export const OWNER_TENANT = "owner";

export const INVITATION_DAYS = 14;
/** How long pass records stay after the teardown, as evidence (then DynamoDB TTL). */
export const PASS_RECORD_DAYS = 30;
/** Provisioning or teardown older than this counts as stuck in the daily reconcile. */
export const STUCK_AFTER_MS = 10 * 60 * 1000;

/**
 * Lifecycle of a pass tenant, kept in `PLATFORM/TENANT#<id>`. Only `active` may be
 * used; `quota-exceeded` answers 429, everything else 403 (service-kit, identity).
 */
export const TenantStatus = z.enum([
  "provisioning",
  "active",
  "quota-exceeded",
  "tearing-down",
  "deleted",
]);
export type TenantStatus = z.infer<typeof TenantStatus>;

const isoDate = z.iso.datetime({ offset: true });

/** `INVITE#<sha256(token)>` / `META` — the token itself is never stored. */
export const Invitation = z.object({
  invitationId: z.string().min(1),
  email: z.email(),
  createdAt: isoDate,
  expiresAt: isoDate,
  createdBy: z.string().min(1),
  /**
   * Short test pass (E2E): lasts `validMinutes`, and the holder's account is created
   * without Cognito's invitation mail (the test sets the password itself).
   */
  shortLived: z.boolean().optional(),
  validMinutes: z.number().int().min(1).max(60).optional(),
  redeemedAt: isoDate.optional(),
  passId: z.string().optional(),
});
export type Invitation = z.infer<typeof Invitation>;

/** `PASS#<passId>` / `META`. */
export const Pass = z.object({
  passId: z.string().min(1),
  tenantId: PassTenantId,
  invitationId: z.string().min(1),
  email: z.email(),
  issuedAt: isoDate,
  validUntil: isoDate,
  status: TenantStatus,
  shortLived: z.boolean().optional(),
  /** First sign-in of the holder; from then the pass lasts `passHours` (not short ones). */
  activatedAt: isoDate.optional(),
  endReason: PassEndReason.optional(),
  endedAt: isoDate.optional(),
});
export type Pass = z.infer<typeof Pass>;

/** `PLATFORM` / `TENANT#<tenantId>` — the list for reconcile, cockpit and the triggers. */
export const PlatformTenant = z.object({
  tenantId: PassTenantId,
  passId: z.string().min(1),
  email: z.email(),
  tableName: z.string().min(1),
  status: TenantStatus,
  validUntil: isoDate,
  createdAt: isoDate,
  updatedAt: isoDate,
  shortLived: z.boolean().optional(),
  /** First sign-in of the holder (see `Pass.activatedAt`). */
  activatedAt: isoDate.optional(),
  /**
   * When the holder, still not signed in after `reminderHours`, got the invitation again
   * (set at most once; architektur-mandanten §5).
   */
  reminderSentAt: isoDate.optional(),
  /** Password of the tenant's demo persons in both legacy systems. */
  demoPassword: z.string().min(16),
});
export type PlatformTenant = z.infer<typeof PlatformTenant>;

/** Default cap of concurrent pass tenants (architektur-mandanten §6). */
export const DEFAULT_MAX_TENANTS = 3;
/**
 * Highest cap the owner may set. Every pass tenant has its own table with 5 RCU/5 WCU
 * provisioned; the Always Free tier covers 25 RCU/25 WCU per account and region. The base
 * table takes 5, so 4 tenants × 5 = 20 more reach exactly 25 — a fifth would be billed.
 */
export const MAX_TENANTS_LIMIT = 4;
/** Upper limit of one upload (documents service, `MAX_UPLOAD_BYTES`), shown on the offer. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/**
 * `PLATFORM` / `SETTINGS`. `activeTenants` counts the pass tenants that are not
 * `deleted`: the redeem adds one in the same transaction that creates the tenant (so the
 * cap holds under concurrency), the teardown removes one when the tenant becomes
 * `deleted`, and the daily reconcile recomputes it from the tenant items. Missing until
 * the first redeem after the feature went live.
 */
export const Settings = z.object({
  redemption: z.enum(["open", "closed"]).default("open"),
  maxTenants: z.number().int().nonnegative().default(DEFAULT_MAX_TENANTS),
  activeTenants: z.number().int().optional(),
  closedAt: isoDate.optional(),
  closedReason: z.string().optional(),
});
export type Settings = z.infer<typeof Settings>;

/** `closedReason` when the owner closes redemption (the budget alarm names itself). */
export const OWNER_CLOSED_REASON = "Vom Inhaber gesperrt";

/** What the owner may change (`PUT /tenancy/settings`). */
export interface SettingsChange {
  redemption?: "open" | "closed" | undefined;
  maxTenants?: number | undefined;
}

export type QuotaUsage = Record<QuotaKind, { used: number; limit: number }>;

export interface QuotaLimits {
  api: number;
  events: number;
  uploads: number;
}

/** Durations and limits, from the environment (wiring) or the tests. */
export interface TenancyConfig {
  portalUrl: string;
  tablePrefix: string;
  /** How long a pass lasts after redeeming (`PASS_HOURS`, default 48). */
  passHours: number;
  /**
   * After how many hours a holder who has not signed in yet gets the invitation again
   * (`REMINDER_HOURS`, default 24).
   */
  reminderHours: number;
  /** Upper bound of `validMinutes` of short test passes (`PASS_MINUTES`, at most 60). */
  maxShortMinutes: number;
  quotas: QuotaLimits;
  /** Redeem attempts per client address and hour. */
  redeemPerClient: number;
  /** Redeem attempts per network source address and hour (spoofed client headers). */
  redeemPerSource: number;
}

/** Scheduler input and the other direct invocations of the worker. */
export const WorkerTask = z.discriminatedUnion("task", [
  z.object({ task: z.literal("expire"), tenantId: PassTenantId, passId: z.string().min(1) }),
  z.object({ task: z.literal("remind"), tenantId: PassTenantId, passId: z.string().min(1) }),
  z.object({ task: z.literal("reconcile") }),
]);
export type WorkerTask = z.infer<typeof WorkerTask>;

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
export const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 3_600_000);
export const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);
export const epochSeconds = (date: Date) => Math.floor(date.getTime() / 1000);
