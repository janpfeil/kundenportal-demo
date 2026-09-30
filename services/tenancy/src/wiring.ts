import { randomUUID } from "node:crypto";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { S3Client } from "@aws-sdk/client-s3";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { cachedLegacyAccess } from "@kundenportal/legacy";
import { requireEnv } from "@kundenportal/service-kit";
import { Altcha, cachedHmacKey } from "./altcha.js";
import {
  CognitoTenantAccounts,
  DynamoTenantTables,
  LegacySystemTenants,
  S3TenantUploads,
  SchedulerExpiry,
} from "./aws.js";
import type { TenancyContext } from "./context.js";
import type { TenancyConfig } from "./model.js";
import { Passes } from "./passes.js";
import { TenancyEvents } from "./publisher.js";
import { TenancyRepository } from "./repository.js";

function numberEnv(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return Math.min(value, max);
}

/** Durations and limits from the environment (defaults: architektur-mandanten §5). */
export function configFromEnv(): TenancyConfig {
  return {
    portalUrl: requireEnv("PORTAL_URL").replace(/\/$/, ""),
    tablePrefix: process.env.TENANT_TABLE_PREFIX || "kp-tenant-",
    passDays: numberEnv("PASS_DAYS", 7),
    maxShortMinutes: numberEnv("PASS_MINUTES", 60, 60),
    quotas: {
      api: numberEnv("QUOTA_API_CALLS", 5000),
      events: numberEnv("QUOTA_EVENTS", 1000),
      uploads: numberEnv("QUOTA_UPLOADS", 20),
    },
    redeemPerClient: numberEnv("REDEEM_PER_CLIENT", 10),
    redeemPerSource: numberEnv("REDEEM_PER_SOURCE", 100),
  };
}

const db = () =>
  DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });

/** Context with the base table and the bus only (API handlers). */
function baseContext(config: TenancyConfig, lifecycle: boolean): TenancyContext {
  const repository = new TenancyRepository(db(), requireEnv("TABLE_NAME"));
  const events = new TenancyEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME"));
  const cognito = new CognitoTenantAccounts(
    new CognitoIdentityProviderClient({}),
    requireEnv("USER_POOL_ID"),
  );
  const unused = <T>(name: string) =>
    new Proxy({} as T & object, {
      get: () => {
        throw new Error(`${name} is not available in this function`);
      },
    });
  return {
    repository,
    events,
    accounts: cognito,
    config,
    now: () => new Date(),
    newId: randomUUID,
    ...(lifecycle
      ? {
          tables: new DynamoTenantTables(new DynamoDBClient({}), config.tablePrefix),
          legacy: new LegacySystemTenants(cachedLegacyAccess(new SSMClient({}), 10_000)),
          schedules: new SchedulerExpiry(new SchedulerClient({}), {
            groupName: requireEnv("PASS_SCHEDULE_GROUP"),
            workerArn: requireEnv("WORKER_ARN"),
            roleArn: requireEnv("SCHEDULER_ROLE_ARN"),
          }),
          uploads: new S3TenantUploads(new S3Client({}), requireEnv("UPLOAD_BUCKET")),
        }
      : {
          tables: unused("tables"),
          legacy: unused("legacy"),
          schedules: unused("schedules"),
          uploads: unused("uploads"),
        }),
  };
}

/** JWT API: invitations, pass administration, own pass. */
export function createApiUseCases() {
  const ctx = baseContext(configFromEnv(), false);
  return { passes: new Passes(ctx) };
}

/** Public API: ALTCHA challenge and redeem. */
export function createPublicUseCases() {
  const ctx = baseContext(configFromEnv(), false);
  const altcha = new Altcha(cachedHmacKey(new SSMClient({}), requireEnv("ALTCHA_HMAC_KEY_PARAM")));
  return { passes: new Passes(ctx), altcha, repository: ctx.repository, config: ctx.config };
}

/** Worker and cleanup: the whole lifecycle with every AWS client. */
export function createLifecycleContext(): TenancyContext {
  return baseContext(configFromEnv(), true);
}
