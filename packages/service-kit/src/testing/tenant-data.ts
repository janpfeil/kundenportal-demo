import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import type { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { TenantStatus, TenantStatusLookup } from "../platform.js";
import {
  createTenantDataSource,
  OWNER_TENANT,
  type TenantData,
  type TenantDataOptions,
  type TenantDataSource,
} from "../tenant-data.js";

/**
 * Tenant data for unit tests: one table and one set of clients for every tenant, so
 * tests that mock the SDK clients by class keep working (tests only).
 */
export function fixedTenantData(
  tableName = "table",
  clients: { db?: DynamoDBDocumentClient; s3?: S3Client } = {},
): TenantDataSource {
  const db = clients.db ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const s3 = clients.s3 ?? new S3Client({});
  return async (tenantId): Promise<TenantData> => ({ tenantId, tableName, db, s3 });
}

/**
 * The real token vending with a fake STS (tests only): every pass tenant gets its own
 * table and clients with credentials `ASIA<TENANT>`; `sessions` lists the tenants STS
 * was asked for, in order.
 */
export function vendedTenantData(options: Omit<TenantDataOptions, "sts" | "roleArn"> = {}): {
  data: TenantDataSource;
  sessions: string[];
} {
  const sessions: string[] = [];
  const sts = {
    send: async (command: AssumeRoleCommand) => {
      const tenant = command.input.Tags?.find((tag) => tag.Key === "tenant")?.Value ?? "";
      sessions.push(tenant);
      return {
        Credentials: {
          AccessKeyId: `ASIA${tenant.toUpperCase()}`,
          SecretAccessKey: "secret",
          SessionToken: `token-${tenant}`,
          Expiration: new Date(Date.now() + 900_000),
        },
      };
    },
  } as unknown as STSClient;
  const data = createTenantDataSource({
    baseTable: "table",
    ...options,
    roleArn: "arn:aws:iam::123456789012:role/kundenportal-tenant-data",
    sts,
  });
  return { data, sessions };
}

/** Platform status from a fixed map; the owner is always active (tests only). */
export function fixedTenantStatus(
  statuses: Record<string, TenantStatus | undefined> = {},
): TenantStatusLookup {
  const status = async (tenantId: string) =>
    tenantId === OWNER_TENANT ? "active" : statuses[tenantId];
  return { status, isActive: async (tenantId) => (await status(tenantId)) === "active" };
}
