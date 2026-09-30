import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  type CognitoIdentityProviderClient,
  ListUsersCommand,
  UsernameExistsException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTimeToLiveCommand,
  type DynamoDBClient,
  ListTablesCommand,
  ResourceInUseException,
  ResourceNotFoundException as TableNotFound,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import {
  ConflictException,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  ResourceNotFoundException as ScheduleNotFound,
  type SchedulerClient,
} from "@aws-sdk/client-scheduler";
import type { LegacyAccess } from "@kundenportal/legacy";
import { PASS_GROUP } from "./model.js";
import {
  type ExpirySchedules,
  type LegacyTenants,
  scheduleName,
  type TenantAccounts,
  type TenantTables,
  type TenantUploads,
} from "./ports.js";

export const TENANT_ATTRIBUTE = "custom:tenant_id";
/** Longest wait for a new table to become ACTIVE (usually a few seconds). */
const TABLE_WAIT_SECONDS = 120;

/** Tenant tables: provisioned 5/5 (Always Free), keys `PK`/`SK`, TTL on `ttl`. */
export class DynamoTenantTables implements TenantTables {
  constructor(
    private readonly dynamo: DynamoDBClient,
    private readonly prefix: string,
  ) {}

  async create(tableName: string, tags: Record<string, string>): Promise<void> {
    try {
      await this.dynamo.send(
        new CreateTableCommand({
          TableName: tableName,
          AttributeDefinitions: [
            { AttributeName: "PK", AttributeType: "S" },
            { AttributeName: "SK", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "PK", KeyType: "HASH" },
            { AttributeName: "SK", KeyType: "RANGE" },
          ],
          BillingMode: "PROVISIONED",
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
          Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
        }),
      );
    } catch (error) {
      // Exists already (retry): wait for it like for a new one.
      if (!(error instanceof ResourceInUseException)) throw error;
    }
    await waitUntilTableExists(
      { client: this.dynamo, maxWaitTime: TABLE_WAIT_SECONDS, minDelay: 1, maxDelay: 5 },
      { TableName: tableName },
    );
    const ttl = await this.dynamo.send(new DescribeTimeToLiveCommand({ TableName: tableName }));
    const state = ttl.TimeToLiveDescription?.TimeToLiveStatus;
    if (state !== "ENABLED" && state !== "ENABLING") {
      await this.dynamo.send(
        new UpdateTimeToLiveCommand({
          TableName: tableName,
          TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
        }),
      );
    }
  }

  async delete(tableName: string): Promise<void> {
    try {
      await this.dynamo.send(new DeleteTableCommand({ TableName: tableName }));
    } catch (error) {
      if (error instanceof TableNotFound) return;
      throw error;
    }
  }

  async list(): Promise<string[]> {
    const names: string[] = [];
    let start: string | undefined;
    do {
      const page = await this.dynamo.send(
        new ListTablesCommand({ ExclusiveStartTableName: start, Limit: 100 }),
      );
      names.push(...(page.TableNames ?? []).filter((name) => name.startsWith(this.prefix)));
      start = page.LastEvaluatedTableName;
    } while (start);
    return names;
  }
}

/** Cognito accounts; the pool is small, so a full listing is cheap enough. */
export class CognitoTenantAccounts implements TenantAccounts {
  constructor(
    private readonly cognito: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
  ) {}

  async exists(email: string): Promise<boolean> {
    const result = await this.cognito.send(
      new ListUsersCommand({
        UserPoolId: this.userPoolId,
        Filter: `email = "${email.replace(/["\\]/g, "")}"`,
        Limit: 1,
      }),
    );
    return (result.Users ?? []).length > 0;
  }

  async createHolder(email: string, tenantId: string, suppressMail: boolean): Promise<void> {
    try {
      await this.cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
            { Name: TENANT_ATTRIBUTE, Value: tenantId },
          ],
          ...(suppressMail
            ? { MessageAction: "SUPPRESS" as const }
            : { DesiredDeliveryMediums: ["EMAIL" as const] }),
        }),
      );
    } catch (error) {
      if (!(error instanceof UsernameExistsException)) throw error;
      // A retry: fine if it is this tenant's holder, a conflict otherwise.
      const existing = await this.cognito.send(
        new AdminGetUserCommand({ UserPoolId: this.userPoolId, Username: email }),
      );
      const tenant = existing.UserAttributes?.find((a) => a.Name === TENANT_ATTRIBUTE)?.Value;
      if (tenant !== tenantId) {
        throw new Error(`The address of pass tenant ${tenantId} belongs to another account`, {
          cause: error,
        });
      }
    }
    await this.cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        GroupName: PASS_GROUP,
      }),
    );
  }

  /**
   * ListUsers cannot filter by custom attributes, so this pages through the whole pool
   * and deletes the tenant's accounts (pass holder and migrated demo persons).
   */
  async deleteTenantAccounts(tenantId: string): Promise<number> {
    const usernames: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.cognito.send(
        new ListUsersCommand({
          UserPoolId: this.userPoolId,
          PaginationToken: token,
          Limit: 60,
          AttributesToGet: [TENANT_ATTRIBUTE],
        }),
      );
      for (const user of page.Users ?? []) {
        const tenant = user.Attributes?.find((a) => a.Name === TENANT_ATTRIBUTE)?.Value;
        if (tenant === tenantId && user.Username) usernames.push(user.Username);
      }
      token = page.PaginationToken;
    } while (token);
    let deleted = 0;
    for (const username of usernames) {
      try {
        await this.cognito.send(
          new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: username }),
        );
        deleted++;
      } catch (error) {
        if (!(error instanceof UserNotFoundException)) throw error;
      }
    }
    return deleted;
  }
}

/**
 * Both legacy systems create (PUT, from their seed template with the tenant's own demo
 * password) or drop (DELETE, idempotent) the tenant's schema.
 */
export class LegacySystemTenants implements LegacyTenants {
  constructor(private readonly legacy: () => Promise<LegacyAccess>) {}

  async provision(tenantId: string, demoPassword: string): Promise<void> {
    const { utility, telco } = await this.legacy();
    await utility.provisionTenant(tenantId, demoPassword);
    await telco.provisionTenant(tenantId, demoPassword);
  }

  async remove(tenantId: string): Promise<void> {
    const { utility, telco } = await this.legacy();
    await utility.removeTenant(tenantId);
    await telco.removeTenant(tenantId);
  }
}

/** `at(...)` expression of EventBridge Scheduler, in UTC without fractions. */
export const atExpression = (date: Date) => `at(${date.toISOString().slice(0, 19)})`;

export class SchedulerExpiry implements ExpirySchedules {
  constructor(
    private readonly scheduler: SchedulerClient,
    private readonly options: { groupName: string; workerArn: string; roleArn: string },
  ) {}

  async create(tenantId: string, passId: string, at: Date): Promise<void> {
    try {
      await this.scheduler.send(
        new CreateScheduleCommand({
          Name: scheduleName(tenantId),
          GroupName: this.options.groupName,
          ScheduleExpression: atExpression(at),
          ScheduleExpressionTimezone: "UTC",
          FlexibleTimeWindow: { Mode: "OFF" },
          ActionAfterCompletion: "DELETE",
          Target: {
            Arn: this.options.workerArn,
            RoleArn: this.options.roleArn,
            Input: JSON.stringify({ task: "expire", tenantId, passId }),
          },
        }),
      );
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
    }
  }

  async delete(tenantId: string): Promise<void> {
    try {
      await this.scheduler.send(
        new DeleteScheduleCommand({
          Name: scheduleName(tenantId),
          GroupName: this.options.groupName,
        }),
      );
    } catch (error) {
      if (!(error instanceof ScheduleNotFound)) throw error;
    }
  }
}

export class S3TenantUploads implements TenantUploads {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async deleteAll(tenantId: string): Promise<number> {
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `uploads/${tenantId}/`,
          ContinuationToken: token,
        }),
      );
      const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []));
      if (keys.length > 0) {
        const result = await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        if (result.Errors?.length) {
          throw new Error(`Could not delete ${result.Errors.length} uploads of ${tenantId}`);
        }
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }
}
