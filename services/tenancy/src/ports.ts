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
  /** Deletes every account whose `custom:tenant_id` is the tenant; returns how many. */
  deleteTenantAccounts(tenantId: string): Promise<number>;
}

/** The tenant's data in both legacy systems (one schema per tenant there). */
export interface LegacyTenants {
  provision(tenantId: string, demoPassword: string): Promise<void>;
  remove(tenantId: string): Promise<void>;
}

/** One-time EventBridge Scheduler schedule that expires the pass. */
export interface ExpirySchedules {
  create(tenantId: string, passId: string, at: Date): Promise<void>;
  delete(tenantId: string): Promise<void>;
}

/** The tenant's upload prefix `uploads/<tenant>/` in the document bucket. */
export interface TenantUploads {
  /** Deletes all objects of the tenant; returns how many. */
  deleteAll(tenantId: string): Promise<number>;
}

/** Name of the expiry schedule of a tenant. */
export const scheduleName = (tenantId: string) => `pass-expiry-${tenantId}`;
