import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  UsernameExistsException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  ListTablesCommand,
  ResourceInUseException,
  ResourceNotFoundException,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import {
  ConflictException,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  ResourceNotFoundException as ScheduleNotFound,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import type { LegacyAccess } from "@kundenportal/legacy";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  atExpression,
  CognitoTenantAccounts,
  DynamoTenantTables,
  LegacySystemTenants,
  S3TenantUploads,
  SchedulerExpiry,
} from "./aws.js";

const dynamoMock = mockClient(DynamoDBClient);
const cognitoMock = mockClient(CognitoIdentityProviderClient);
const schedulerMock = mockClient(SchedulerClient);
const s3Mock = mockClient(S3Client);
const meta = { $metadata: {} };

beforeEach(() => {
  dynamoMock.reset();
  cognitoMock.reset();
  schedulerMock.reset();
  s3Mock.reset();
});

describe("tenant tables", () => {
  const tables = new DynamoTenantTables(new DynamoDBClient({}), "kp-tenant-");

  it("creates a provisioned 5/5 table with tags, waits for ACTIVE and enables TTL", async () => {
    dynamoMock.on(CreateTableCommand).resolves({});
    dynamoMock.on(DescribeTableCommand).resolves({ Table: { TableStatus: "ACTIVE" } });
    dynamoMock.on(DescribeTimeToLiveCommand).resolves({
      TimeToLiveDescription: { TimeToLiveStatus: "DISABLED" },
    });
    dynamoMock.on(UpdateTimeToLiveCommand).resolves({});
    await tables.create("kp-tenant-p4k7x2qa", { "kundenportal:tenant": "p4k7x2qa" });
    expect(dynamoMock.commandCalls(CreateTableCommand)[0]?.args[0].input).toMatchObject({
      TableName: "kp-tenant-p4k7x2qa",
      BillingMode: "PROVISIONED",
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      Tags: [{ Key: "kundenportal:tenant", Value: "p4k7x2qa" }],
    });
    expect(dynamoMock.commandCalls(UpdateTimeToLiveCommand)[0]?.args[0].input).toEqual({
      TableName: "kp-tenant-p4k7x2qa",
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
    });
  });

  it("accepts an existing table with TTL already on (retry)", async () => {
    dynamoMock
      .on(CreateTableCommand)
      .rejects(new ResourceInUseException({ message: "exists", ...meta }));
    dynamoMock.on(DescribeTableCommand).resolves({ Table: { TableStatus: "ACTIVE" } });
    dynamoMock.on(DescribeTimeToLiveCommand).resolves({
      TimeToLiveDescription: { TimeToLiveStatus: "ENABLED" },
    });
    await tables.create("kp-tenant-p4k7x2qa", {});
    expect(dynamoMock.commandCalls(UpdateTimeToLiveCommand)).toHaveLength(0);
  });

  it("deletes idempotently and lists only tenant tables", async () => {
    dynamoMock
      .on(DeleteTableCommand)
      .rejects(new ResourceNotFoundException({ message: "gone", ...meta }));
    await tables.delete("kp-tenant-p4k7x2qa");
    dynamoMock
      .on(ListTablesCommand)
      .resolvesOnce({ TableNames: ["base", "kp-tenant-paaaaaaa"], LastEvaluatedTableName: "x" })
      .resolvesOnce({ TableNames: ["kp-tenant-pbbbbbbb"] });
    expect(await tables.list()).toEqual(["kp-tenant-paaaaaaa", "kp-tenant-pbbbbbbb"]);
  });
});

describe("cognito accounts", () => {
  const accounts = new CognitoTenantAccounts(new CognitoIdentityProviderClient({}), "pool");

  it("creates the holder with tenant, verified address and invitation mail", async () => {
    cognitoMock.on(AdminCreateUserCommand).resolves({});
    cognitoMock.on(AdminAddUserToGroupCommand).resolves({});
    await accounts.createHolder("visitor@example.org", "p4k7x2qa", false);
    const input = cognitoMock.commandCalls(AdminCreateUserCommand)[0]?.args[0].input;
    expect(input).toMatchObject({
      Username: "visitor@example.org",
      DesiredDeliveryMediums: ["EMAIL"],
      UserAttributes: [
        { Name: "email", Value: "visitor@example.org" },
        { Name: "email_verified", Value: "true" },
        { Name: "custom:tenant_id", Value: "p4k7x2qa" },
      ],
    });
    expect(input?.MessageAction).toBeUndefined();
    expect(cognitoMock.commandCalls(AdminAddUserToGroupCommand)[0]?.args[0].input).toMatchObject({
      GroupName: "pass",
    });
  });

  it("suppresses the mail for short test passes", async () => {
    cognitoMock.on(AdminCreateUserCommand).resolves({});
    await accounts.createHolder("e2e@example.org", "p4k7x2qa", true);
    const input = cognitoMock.commandCalls(AdminCreateUserCommand)[0]?.args[0].input;
    expect(input?.MessageAction).toBe("SUPPRESS");
    expect(input?.DesiredDeliveryMediums).toBeUndefined();
  });

  it("accepts its own holder on retry and refuses a foreign account", async () => {
    cognitoMock
      .on(AdminCreateUserCommand)
      .rejects(new UsernameExistsException({ message: "exists", ...meta }));
    cognitoMock
      .on(AdminGetUserCommand)
      .resolvesOnce({ UserAttributes: [{ Name: "custom:tenant_id", Value: "p4k7x2qa" }] })
      .resolvesOnce({ UserAttributes: [] });
    await accounts.createHolder("visitor@example.org", "p4k7x2qa", false);
    await expect(accounts.createHolder("visitor@example.org", "p4k7x2qa", false)).rejects.toThrow(
      /another account/,
    );
  });

  it("pages through the pool and deletes only the tenant's accounts", async () => {
    const user = (username: string, tenant?: string) => ({
      Username: username,
      Attributes: tenant ? [{ Name: "custom:tenant_id", Value: tenant }] : [],
    });
    cognitoMock
      .on(ListUsersCommand)
      .resolvesOnce({ Users: [user("a", "p4k7x2qa"), user("owner")], PaginationToken: "t" })
      .resolvesOnce({ Users: [user("b", "p4k7x2qa"), user("c", "pbbbbbbb")] });
    cognitoMock.on(AdminDeleteUserCommand).resolves({});
    expect(await accounts.deleteTenantAccounts("p4k7x2qa")).toBe(2);
    expect(
      cognitoMock.commandCalls(AdminDeleteUserCommand).map((c) => c.args[0].input.Username),
    ).toEqual(["a", "b"]);
    expect(cognitoMock.commandCalls(ListUsersCommand)[1]?.args[0].input.PaginationToken).toBe("t");
    // Cognito refuses custom attributes in AttributesToGet, so the call must not name any.
    expect(cognitoMock.commandCalls(ListUsersCommand)[0]?.args[0].input.AttributesToGet).toBe(
      undefined,
    );
  });

  it("reads the holder's status and knows a missing account", async () => {
    cognitoMock
      .on(AdminGetUserCommand)
      .resolvesOnce({ UserStatus: "FORCE_CHANGE_PASSWORD" })
      .rejectsOnce(new UserNotFoundException({ message: "gone", ...meta }));
    expect(await accounts.holderStatus("visitor@example.org")).toBe("FORCE_CHANGE_PASSWORD");
    expect(await accounts.holderStatus("visitor@example.org")).toBeUndefined();
  });

  it("resends the invitation to the same address", async () => {
    cognitoMock.on(AdminCreateUserCommand).resolves({});
    await accounts.resendInvitation("visitor@example.org");
    expect(cognitoMock.commandCalls(AdminCreateUserCommand)[0]?.args[0].input).toEqual({
      UserPoolId: "pool",
      Username: "visitor@example.org",
      MessageAction: "RESEND",
      DesiredDeliveryMediums: ["EMAIL"],
    });
  });

  it("finds existing accounts by address", async () => {
    cognitoMock.on(ListUsersCommand).resolves({ Users: [{ Username: "x" }] });
    expect(await accounts.exists("anna@example.org")).toBe(true);
    expect(cognitoMock.commandCalls(ListUsersCommand)[0]?.args[0].input.Filter).toBe(
      'email = "anna@example.org"',
    );
  });
});

describe("expiry schedules", () => {
  const schedules = new SchedulerExpiry(new SchedulerClient({}), {
    groupName: "kundenportal-passes",
    workerArn: "arn:worker",
    roleArn: "arn:role",
  });

  it("creates a one-time UTC schedule that deletes itself", async () => {
    schedulerMock.on(CreateScheduleCommand).resolves({});
    await schedules.create("p4k7x2qa", "pass-1", new Date("2026-10-07T12:00:00.123Z"));
    expect(schedulerMock.commandCalls(CreateScheduleCommand)[0]?.args[0].input).toEqual({
      Name: "pass-expiry-p4k7x2qa",
      GroupName: "kundenportal-passes",
      ScheduleExpression: "at(2026-10-07T12:00:00)",
      ScheduleExpressionTimezone: "UTC",
      FlexibleTimeWindow: { Mode: "OFF" },
      ActionAfterCompletion: "DELETE",
      Target: {
        Arn: "arn:worker",
        RoleArn: "arn:role",
        Input: '{"task":"expire","tenantId":"p4k7x2qa","passId":"pass-1"}',
      },
    });
  });

  it("creates the reminder and the moved expiry under names of their own", async () => {
    schedulerMock.on(CreateScheduleCommand).resolves({});
    await schedules.createReminder("p4k7x2qa", "pass-1", new Date("2026-10-01T12:00:00Z"));
    await schedules.moveExpiry("p4k7x2qa", "pass-1", new Date("2026-10-03T08:00:00Z"));
    const [reminder, moved] = schedulerMock
      .commandCalls(CreateScheduleCommand)
      .map((call) => call.args[0].input);
    expect(reminder).toMatchObject({
      Name: "pass-reminder-p4k7x2qa",
      ScheduleExpression: "at(2026-10-01T12:00:00)",
      ActionAfterCompletion: "DELETE",
      Target: { Input: '{"task":"remind","tenantId":"p4k7x2qa","passId":"pass-1"}' },
    });
    expect(moved).toMatchObject({
      Name: "pass-expiry-moved-p4k7x2qa",
      ScheduleExpression: "at(2026-10-03T08:00:00)",
      Target: { Input: '{"task":"expire","tenantId":"p4k7x2qa","passId":"pass-1"}' },
    });
  });

  it("is idempotent in both directions", async () => {
    schedulerMock
      .on(CreateScheduleCommand)
      .rejects(new ConflictException({ message: "x", Message: "x", ...meta }));
    schedulerMock
      .on(DeleteScheduleCommand)
      .rejects(new ScheduleNotFound({ message: "x", Message: "x", ...meta }));
    await schedules.create("p4k7x2qa", "pass-1", new Date());
    await schedules.delete("p4k7x2qa");
    expect(
      schedulerMock.commandCalls(DeleteScheduleCommand).map((call) => call.args[0].input.Name),
    ).toEqual(["pass-expiry-p4k7x2qa", "pass-expiry-moved-p4k7x2qa", "pass-reminder-p4k7x2qa"]);
    expect(atExpression(new Date("2026-01-02T03:04:05Z"))).toBe("at(2026-01-02T03:04:05)");
  });
});

describe("uploads and legacy systems", () => {
  it("deletes all uploads under the tenant's prefix, page by page", async () => {
    s3Mock
      .on(ListObjectsV2Command)
      .resolvesOnce({
        Contents: [{ Key: "uploads/p4k7x2qa/c/1" }],
        IsTruncated: true,
        NextContinuationToken: "n",
      })
      .resolvesOnce({ Contents: [{ Key: "uploads/p4k7x2qa/c/2" }] });
    s3Mock.on(DeleteObjectsCommand).resolves({});
    const uploads = new S3TenantUploads(new S3Client({}), "bucket");
    expect(await uploads.deleteAll("p4k7x2qa")).toBe(2);
    expect(s3Mock.commandCalls(ListObjectsV2Command)[0]?.args[0].input.Prefix).toBe(
      "uploads/p4k7x2qa/",
    );
  });

  it("provisions and removes the tenant in both legacy systems", async () => {
    const calls: string[] = [];
    const client = (name: string) => ({
      provisionTenant: async (tenant: string, password: string) => {
        calls.push(`${name}:provision:${tenant}:${password}`);
      },
      removeTenant: async (tenant: string) => {
        calls.push(`${name}:remove:${tenant}`);
      },
    });
    const access = { utility: client("utility"), telco: client("telco") };
    const legacy = new LegacySystemTenants(async () => access as unknown as LegacyAccess);
    await legacy.provision("p4k7x2qa", "Demo-pw-1234567890");
    await legacy.remove("p4k7x2qa");
    expect(calls).toEqual([
      "utility:provision:p4k7x2qa:Demo-pw-1234567890",
      "telco:provision:p4k7x2qa:Demo-pw-1234567890",
      "utility:remove:p4k7x2qa",
      "telco:remove:p4k7x2qa",
    ]);
  });
});
