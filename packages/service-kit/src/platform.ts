import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { forbidden, HttpError } from "./errors.js";
import { isPassTenant, OWNER_TENANT, tenantData, type TenantDataSource } from "./tenant-data.js";

/**
 * Status of a pass tenant in its platform item `PLATFORM` / `TENANT#<id>` (written by the
 * tenancy service). Only `active` may use the portal; `quota-exceeded` still has its data.
 */
export type TenantStatus =
  "provisioning" | "active" | "quota-exceeded" | "tearing-down" | "deleted";

/** Key of a pass tenant's platform item in the base table. */
export const platformTenantKey = (tenantId: string) => ({
  PK: "PLATFORM",
  SK: `TENANT#${tenantId}`,
});

/** Key of a quota counter of a pass tenant in the base table (attribute `used`). */
export const quotaKey = (tenantId: string, kind: "api" | "events" | "uploads") => ({
  PK: `TENANT#${tenantId}`,
  SK: `QUOTA#${kind}`,
});

export interface TenantDirectoryOptions {
  data?: TenantDataSource;
  /** How long a looked-up status is reused. Default 30 seconds. */
  ttlMs?: number;
  now?: () => number;
}

/** Platform status of tenants as the services need it. */
export interface TenantStatusLookup {
  /** `undefined` if the tenant does not exist (no platform item, invalid id). */
  status(tenantId: string): Promise<TenantStatus | undefined>;
  /** True if the tenant may use the portal right now. */
  isActive(tenantId: string): Promise<boolean>;
}

/**
 * Reads the platform status of tenants from the base table, cached for a short time.
 * The owner is always `active`; an id without platform item has no status (`undefined`).
 */
export class TenantDirectory implements TenantStatusLookup {
  private readonly cache = new Map<
    string,
    { status: Promise<TenantStatus | undefined>; until: number }
  >();
  private readonly data: TenantDataSource;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: TenantDirectoryOptions = {}) {
    this.data = options.data ?? tenantData;
    this.ttlMs = options.ttlMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  async status(tenantId: string): Promise<TenantStatus | undefined> {
    if (tenantId === OWNER_TENANT) return "active";
    if (!isPassTenant(tenantId)) return undefined;
    const cached = this.cache.get(tenantId);
    if (cached && this.now() < cached.until) return cached.status;
    const status = this.lookup(tenantId);
    this.cache.set(tenantId, { status, until: this.now() + this.ttlMs });
    status.catch(() => this.cache.delete(tenantId));
    return status;
  }

  async isActive(tenantId: string): Promise<boolean> {
    return (await this.status(tenantId)) === "active";
  }

  private async lookup(tenantId: string): Promise<TenantStatus | undefined> {
    const base = await this.data(OWNER_TENANT);
    const result = await base.db.send(
      new GetCommand({ TableName: base.tableName, Key: platformTenantKey(tenantId) }),
    );
    return result.Item?.status as TenantStatus | undefined;
  }
}

export const quotaExhausted = (detail?: string) =>
  new HttpError(429, "Kontingent erschöpft", detail);

/** Runs before an API route of a pass tenant; throws an `HttpError` to refuse the call. */
export type TenantGuard = (tenantId: string) => Promise<void>;

export interface ApiQuotaOptions {
  data?: TenantDataSource;
  directory?: TenantStatusLookup;
  /** API calls a pass may make. Default: env `QUOTA_API_CALLS` or 5000. */
  limit?: number;
  /** Clock for `lastActiveAt` (tests). */
  now?: () => Date;
}

/** API calls a demo pass may make unless `QUOTA_API_CALLS` says otherwise (§5). */
export const DEFAULT_API_CALL_LIMIT = 5000;

function limitFromEnv(): number {
  const value = Number(process.env.QUOTA_API_CALLS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_API_CALL_LIMIT;
}

/**
 * Guard of the API for pass tenants (architektur-mandanten §5): refuses the call with
 * 403 unless the pass is active (429 if the tenancy service marked it `quota-exceeded`),
 * then counts it atomically in the base table and refuses with 429 once the limit is
 * reached. The same update records `lastActiveAt`, which the owner's cockpit shows as the
 * tenant's last activity — no extra write. The owner is never counted.
 */
export function createApiQuota(options: ApiQuotaOptions = {}): TenantGuard {
  const data = options.data ?? tenantData;
  const directory = options.directory ?? new TenantDirectory({ data });
  return async (tenantId) => {
    if (!isPassTenant(tenantId)) return;
    const status = await directory.status(tenantId);
    if (status === "quota-exceeded")
      throw quotaExhausted("Das Kontingent des Demo-Passes ist aufgebraucht");
    if (status !== "active") throw forbidden("Der Demo-Pass ist nicht aktiv");
    const limit = options.limit ?? limitFromEnv();
    const base = await data(OWNER_TENANT);
    try {
      await base.db.send(
        new UpdateCommand({
          TableName: base.tableName,
          Key: quotaKey(tenantId, "api"),
          UpdateExpression: "ADD #used :one SET #lastActiveAt = :now",
          ConditionExpression: "attribute_not_exists(#used) OR #used < :limit",
          ExpressionAttributeNames: { "#used": "used", "#lastActiveAt": "lastActiveAt" },
          ExpressionAttributeValues: {
            ":one": 1,
            ":limit": limit,
            ":now": (options.now ?? (() => new Date()))().toISOString(),
          },
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw quotaExhausted(`Die ${limit} API-Aufrufe des Demo-Passes sind aufgebraucht`);
      }
      throw error;
    }
  };
}
