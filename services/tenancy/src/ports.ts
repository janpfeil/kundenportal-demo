/**
 * What the lifecycle of a pass tenant touches outside the base table. Every operation is
 * idempotent: creating something that exists or deleting something that is gone is fine,
 * because Lambda retries and the reconcile re-drives.
 */

/** The tenant's own DynamoDB table `kp-tenant-<id>`. */
export interface TenantTables {
  /** Creates the table (if missing), waits until it is ACTIVE and enables TTL. */
  create(tableName: string, tags: Record<string, string>): Promise<void>;
  delete(tableName: string): Promise<void>;
  /** Names of all tenant tables (prefix `kp-tenant-`). */
  list(): Promise<string[]>;
}

/** Cognito accounts of a tenant. */
export interface TenantAccounts {
  /** Whether the address already signs in to the portal (any tenant). */
  exists(email: string): Promise<boolean>;
  /**
   * Creates the pass holder (group `pass`, `custom:tenant_id`). With `suppressMail`
   * Cognito sends no invitation (short E2E passes).
   */
  createHolder(email: string, tenantId: string, suppressMail: boolean): Promise<void>;
  /**
   * Cognito `UserStatus` of the account (`FORCE_CHANGE_PASSWORD` until the first sign-in,
   * then `CONFIRMED`); undefined if there is none.
   */
  holderStatus(email: string): Promise<string | undefined>;
  /** Sends the invitation again, with a new temporary password, to the same address. */
  resendInvitation(email: string): Promise<void>;
  /** Deletes every account whose `custom:tenant_id` is the tenant; returns how many. */
  deleteTenantAccounts(tenantId: string): Promise<number>;
}

/** The tenant's data in both legacy systems (one schema per tenant there). */
export interface LegacyTenants {
  provision(tenantId: string, demoPassword: string): Promise<void>;
  remove(tenantId: string): Promise<void>;
}

/**
 * One-time EventBridge Scheduler schedules of a pass: the expiry and the reminder to a
 * holder who has not signed in yet.
 */
export interface ExpirySchedules {
  create(tenantId: string, passId: string, at: Date): Promise<void>;
  createReminder(tenantId: string, passId: string, at: Date): Promise<void>;
  /** A second expiry schedule at `at` (the first sign-in moved the end). */
  moveExpiry(tenantId: string, passId: string, at: Date): Promise<void>;
  /** Deletes every schedule of the tenant. */
  delete(tenantId: string): Promise<void>;
}

/** The tenant's upload prefix `uploads/<tenant>/` in the document bucket. */
export interface TenantUploads {
  /** Deletes all objects of the tenant; returns how many. */
  deleteAll(tenantId: string): Promise<number>;
}

/**
 * Short operational hints to the portal owner (the owner topic in SNS with an e-mail
 * subscription). Hints name the pass, its address and tenant — never the demo password
 * or a token.
 */
export interface OwnerHints {
  send(subject: string, message: string): Promise<void>;
}

/** Name of the expiry schedule of a tenant. */
export const scheduleName = (tenantId: string) => `pass-expiry-${tenantId}`;
/** Name of the expiry schedule after the first sign-in moved the end. */
export const movedScheduleName = (tenantId: string) => `pass-expiry-moved-${tenantId}`;
/** Name of the reminder schedule of a tenant. */
export const reminderScheduleName = (tenantId: string) => `pass-reminder-${tenantId}`;
