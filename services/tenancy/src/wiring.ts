import { randomUUID } from "node:crypto";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { S3Client } from "@aws-sdk/client-s3";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { SNSClient } from "@aws-sdk/client-sns";
import { SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { cachedLegacyAccess } from "@kundenportal/legacy";
import { DYNAMODB_RETRY, log, requireEnv } from "@kundenportal/service-kit";
import { Altcha, cachedHmacKey } from "./altcha.js";
import {
  CognitoTenantAccounts,
  DynamoTenantTables,
  LegacySystemTenants,
  S3TenantUploads,
  SchedulerExpiry,
  SnsOwnerHints,
} from "./aws.js";
import type { TenancyContext } from "./context.js";
import type { TenancyConfig } from "./model.js";
import { Passes } from "./passes.js";
import type { OwnerHints } from "./ports.js";
import { TenancyEvents } from "./publisher.js";
import { TenancyRepository } from "./repository.js";
import { PlatformSettings } from "./settings.js";

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
    passHours: numberEnv("PASS_HOURS", 48),
    reminderHours: numberEnv("REMINDER_HOURS", 24),
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

/**
 * ARN of the worker the expiry schedules call. CDK cannot pass the function its own ARN
 * (a reference cycle), so it passes the account and the worker builds it from the
 * function name Lambda sets; `WORKER_ARN` wins where given (cleanup, tests).
 */
export function workerArn(env: NodeJS.ProcessEnv = process.env): string {
  if (env.WORKER_ARN) return env.WORKER_ARN;
  const region = env.AWS_REGION;
  const account = env.ACCOUNT_ID;
  const name = env.AWS_LAMBDA_FUNCTION_NAME;
  if (!region || !account || !name) throw new Error("WORKER_ARN or ACCOUNT_ID is not set");
  return `arn:aws:lambda:${region}:${account}:function:${name}`;
}

/**
 * Hints to the owner via the owner topic (`OWNER_TOPIC_ARN`). Without it (a stack that
 * predates the hints) the worker logs instead, so provisioning never fails over a hint.
 */
export function ownerHintsFromEnv(env: NodeJS.ProcessEnv = process.env): OwnerHints {
  const topicArn = env.OWNER_TOPIC_ARN;
  if (topicArn) return new SnsOwnerHints(new SNSClient({}), topicArn);
  return {
    send: async (subject) => log("warn", "OWNER_TOPIC_ARN is not set; hint dropped", { subject }),
  };
}

const db = () =>
  DynamoDBDocumentClient.from(new DynamoDBClient({ ...DYNAMODB_RETRY }), {
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
          tables: new DynamoTenantTables(
            new DynamoDBClient({ ...DYNAMODB_RETRY }),
            config.tablePrefix,
          ),
          legacy: new LegacySystemTenants(cachedLegacyAccess(new SSMClient({}), 10_000)),
          schedules: new SchedulerExpiry(new SchedulerClient({}), {
            groupName: requireEnv("PASS_SCHEDULE_GROUP"),
            workerArn: workerArn(),
            roleArn: requireEnv("SCHEDULER_ROLE_ARN"),
          }),
          uploads: new S3TenantUploads(new S3Client({}), requireEnv("UPLOAD_BUCKET")),
          ownerHints: ownerHintsFromEnv(),
        }
      : {
          tables: unused("tables"),
          legacy: unused("legacy"),
          schedules: unused("schedules"),
          uploads: unused("uploads"),
          ownerHints: unused("ownerHints"),
        }),
  };
}

/** JWT API: invitations, pass administration, own pass, platform settings. */
export function createApiUseCases() {
  const ctx = baseContext(configFromEnv(), false);
  return {
    passes: new Passes(ctx),
    settings: new PlatformSettings(ctx.repository, ctx.config, ctx.now),
  };
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
