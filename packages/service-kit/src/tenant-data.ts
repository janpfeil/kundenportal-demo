import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "./env.js";

/** Tenant of the portal owner; its data stays in the base table (architektur-mandanten §1). */
export const OWNER_TENANT = "owner";

/**
 * Tenant of a demo pass: "p" plus seven base32 characters. Mirrors `PassTenantId` in
 * `@kundenportal/events`; kept here as a plain pattern so the kit needs no events package.
 */
export const PASS_TENANT_PATTERN = /^p[a-z2-7]{7}$/;

export function isPassTenant(tenantId: string): boolean {
  return PASS_TENANT_PATTERN.test(tenantId);
}

/** Default table name prefix of a pass tenant's own table. */
export const DEFAULT_TENANT_TABLE_PREFIX = "kp-tenant-";

/** Lifetime of vended credentials (the minimum STS allows). */
const SESSION_SECONDS = 900;

/** Where and with which clients the data of one tenant lives. */
export interface TenantData {
  tenantId: string;
  tableName: string;
  db: DynamoDBDocumentClient;
  s3: S3Client;
}

/** Resolves the data access of a tenant; throws for an unknown tenant id. */
export type TenantDataSource = (tenantId: string) => Promise<TenantData>;

export interface TenantDataOptions {
  /** Base table (the owner's data and the platform items). Default: env `TABLE_NAME`. */
  baseTable?: string;
  /** Prefix of pass tenant tables. Default: env `TENANT_TABLE_PREFIX` or `kp-tenant-`. */
  tablePrefix?: string;
  /** Role the Lambda assumes for a pass tenant. Default: env `TENANT_DATA_ROLE_ARN`. */
  roleArn?: string;
  /** Extra S3 client settings (e.g. `requestChecksumCalculation` for presigned URLs). */
  s3Config?: S3ClientConfig;
  /**
   * Vended credentials are renewed when less than this is left. A presigned URL is only
   * valid while its credentials are, so a service that signs URLs sets at least their
   * lifetime here. Default 60 seconds.
   */
  minValiditySeconds?: number;
  sts?: STSClient;
  now?: () => number;
}

interface CacheEntry {
  data: Promise<TenantData>;
  /** Epoch ms until which the entry may be handed out. */
  usableUntil: number;
}

const DOCUMENT_OPTIONS = { marshallOptions: { removeUndefinedValues: true } } as const;

/**
 * Every table is provisioned with 5 read and 5 write units (always free). A burst — a
 * demo reset, a bulk import, parallel page loads — briefly exceeds that; the adaptive
 * retry mode backs off and slows the client down instead of failing the request.
 */
export const DYNAMODB_RETRY = { maxAttempts: 8, retryMode: "adaptive" } as const;

function documentClient(options?: ConstructorParameters<typeof DynamoDBClient>[0]) {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({ ...DYNAMODB_RETRY, ...options }),
    DOCUMENT_OPTIONS,
  );
}

/**
 * Token vending (architektur-mandanten §3): `owner` → base table with the Lambda's own
 * credentials; a pass tenant → its own table `kp-tenant-<id>` with credentials of the
 * tenant data role, assumed with the session tag `tenant`. The role's policy resolves the
 * table and the upload prefix from that tag, so a wrong key can at most reach the own
 * table. Clients are cached per tenant until shortly before the credentials expire; a
 * tenant's clients are never handed to another tenant.
 */
export function createTenantDataSource(options: TenantDataOptions = {}): TenantDataSource {
  const now = options.now ?? Date.now;
  const minValidityMs = (options.minValiditySeconds ?? 60) * 1000;
  const cache = new Map<string, CacheEntry>();
  let owner: TenantData | undefined;
  let sts = options.sts;

  const ownerData = (): TenantData => {
    owner ??= {
      tenantId: OWNER_TENANT,
      tableName: options.baseTable ?? requireEnv("TABLE_NAME"),
      db: documentClient(),
      s3: new S3Client({ ...options.s3Config }),
    };
    return owner;
  };

  const assume = async (tenantId: string): Promise<{ data: TenantData; expiresAt: number }> => {
    sts ??= new STSClient({});
    const result = await sts.send(
      new AssumeRoleCommand({
        RoleArn: options.roleArn ?? requireEnv("TENANT_DATA_ROLE_ARN"),
        RoleSessionName: `tenant-${tenantId}`,
        DurationSeconds: SESSION_SECONDS,
        Tags: [{ Key: "tenant", Value: tenantId }],
      }),
    );
    const c = result.Credentials;
    if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) {
      throw new Error(`STS returned no credentials for tenant ${tenantId}`);
    }
    const credentials = {
      accessKeyId: c.AccessKeyId,
      secretAccessKey: c.SecretAccessKey,
      sessionToken: c.SessionToken,
      ...(c.Expiration ? { expiration: c.Expiration } : {}),
    };
    const prefix =
      options.tablePrefix ?? process.env.TENANT_TABLE_PREFIX ?? DEFAULT_TENANT_TABLE_PREFIX;
    return {
      data: {
        tenantId,
        tableName: `${prefix}${tenantId}`,
        db: documentClient({ credentials }),
        s3: new S3Client({ ...options.s3Config, credentials }),
      },
      expiresAt: c.Expiration?.getTime() ?? now() + SESSION_SECONDS * 1000,
    };
  };

  return async (tenantId) => {
    if (tenantId === OWNER_TENANT) return ownerData();
    if (!isPassTenant(tenantId)) throw new Error(`Unknown tenant ${JSON.stringify(tenantId)}`);

    const cached = cache.get(tenantId);
    if (cached && now() < cached.usableUntil) return cached.data;

    for (const [key, entry] of cache) if (now() >= entry.usableUntil) cache.delete(key);
    const pending = assume(tenantId);
    // Until STS answers, concurrent calls share the pending request.
    const entry: CacheEntry = {
      data: pending.then((r) => r.data),
      usableUntil: Number.POSITIVE_INFINITY,
    };
    cache.set(tenantId, entry);
    // Callers that share the pending entry see the rejection; this only avoids an
    // unhandled rejection when nobody else waits.
    entry.data.catch(() => undefined);
    try {
      const { expiresAt } = await pending;
      entry.usableUntil = expiresAt - minValidityMs;
    } catch (error) {
      if (cache.get(tenantId) === entry) cache.delete(tenantId);
      throw error;
    }
    return entry.data;
  };
}

let defaultSource: TenantDataSource | undefined;

/**
 * Data access of a tenant with the configuration from the environment (`TABLE_NAME`,
 * `TENANT_TABLE_PREFIX`, `TENANT_DATA_ROLE_ARN`), shared by everything in the Lambda.
 */
export const tenantData: TenantDataSource = (tenantId) => {
  defaultSource ??= createTenantDataSource();
  return defaultSource(tenantId);
};
