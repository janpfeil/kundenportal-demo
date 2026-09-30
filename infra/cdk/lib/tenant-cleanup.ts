import { CustomResource, Duration, Stack } from "aws-cdk-lib";
import type { ITable } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { IBucket } from "aws-cdk-lib/aws-s3";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Construct, type IDependable } from "constructs";
import { ServiceFunction } from "./functions.js";
import { EVENT_BUS_NAME } from "./identity.js";
import { grantLegacyAccess } from "./legacy-access.js";
import { PASS_SCHEDULE_GROUP, TENANT_TABLE_PREFIX } from "./tenant-data.js";

export interface TenantCleanupProps {
  table: ITable;
  uploadBucket: IBucket;
  userPoolId: string;
  portalUrl: string;
  reservedConcurrency: number;
  /** Resources the teardown still needs; the custom resource is deleted before them. */
  dependsOn: IDependable[];
}

/**
 * Pass tenants are created at runtime, so CloudFormation does not know them. When the base
 * stack is deleted (`teardown.sh --all`), this custom resource tears every pass tenant down
 * first — tables, legacy data, accounts, uploads — and only then the table, user pool and
 * bucket go. A pause (app stack only) keeps the tenants.
 */
export class TenantCleanup extends Construct {
  constructor(scope: Construct, id: string, props: TenantCleanupProps) {
    super(scope, id);
    const stack = Stack.of(this);

    const fn = new ServiceFunction(this, "Function", {
      entry: "services/tenancy/src/cleanup-handler.ts",
      description: "tenancy: tear down all pass tenants before the base stack goes",
      reservedConcurrency: props.reservedConcurrency,
      timeout: Duration.minutes(10),
      environment: {
        TABLE_NAME: props.table.tableName,
        EVENT_BUS_NAME,
        PORTAL_URL: props.portalUrl,
        USER_POOL_ID: props.userPoolId,
        UPLOAD_BUCKET: props.uploadBucket.bucketName,
        TENANT_TABLE_PREFIX,
        PASS_SCHEDULE_GROUP,
        // Teardown creates no schedules; the lifecycle context only needs the names.
        WORKER_ARN: "-",
        SCHEDULER_ROLE_ARN: "-",
      },
    });
    props.table.grantReadWriteData(fn);
    props.uploadBucket.grantDelete(fn, "uploads/*");
    grantLegacyAccess(fn);
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [props.uploadBucket.bucketArn],
        conditions: { StringLike: { "s3:prefix": ["uploads/*"] } },
      }),
    );
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: ["dynamodb:DeleteTable", "dynamodb:DescribeTable"],
        resources: [
          stack.formatArn({
            service: "dynamodb",
            resource: "table",
            resourceName: `${TENANT_TABLE_PREFIX}*`,
          }),
        ],
      }),
    );
    fn.addToRolePolicy(new PolicyStatement({ actions: ["dynamodb:ListTables"], resources: ["*"] }));
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: ["cognito-idp:ListUsers", "cognito-idp:AdminDeleteUser"],
        resources: [
          stack.formatArn({
            service: "cognito-idp",
            resource: "userpool",
            resourceName: props.userPoolId,
          }),
        ],
      }),
    );
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: ["scheduler:DeleteSchedule"],
        resources: [
          stack.formatArn({
            service: "scheduler",
            resource: "schedule",
            resourceName: `${PASS_SCHEDULE_GROUP}/*`,
          }),
        ],
      }),
    );
    // The bus may already be gone with the app stack; the teardown tolerates that.
    fn.addToRolePolicy(
      new PolicyStatement({
        actions: ["events:PutEvents"],
        resources: [
          stack.formatArn({
            service: "events",
            resource: "event-bus",
            resourceName: EVENT_BUS_NAME,
          }),
        ],
      }),
    );

    const provider = new Provider(this, "Provider", {
      onEventHandler: fn,
    });
    const resource = new CustomResource(this, "Resource", {
      serviceToken: provider.serviceToken,
      resourceType: "Custom::PassTenantCleanup",
    });
    for (const dependency of props.dependsOn) resource.node.addDependency(dependency);
  }
}
