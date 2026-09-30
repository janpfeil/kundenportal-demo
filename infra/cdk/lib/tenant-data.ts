import { Aws, Stack } from "aws-cdk-lib";
import { CfnScheduleGroup } from "aws-cdk-lib/aws-scheduler";
import {
  AccountPrincipal,
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  SessionTagsPrincipal,
} from "aws-cdk-lib/aws-iam";
import type { IBucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

/** Prefix of the DynamoDB tables the tenancy service creates per demo pass. */
export const TENANT_TABLE_PREFIX = "kp-tenant-";
/** Schedule group of the one-time pass expiry schedules; lives in the base so a pause keeps it. */
export const PASS_SCHEDULE_GROUP = "kundenportal-passes";
/** Pass tenant ids: "p" plus seven base32 characters (packages/events PassTenantId). */
const PASS_TENANT_PATTERN = "p???????";

/**
 * Token vending for the bridge model (docs/wiki/architektur-mandanten.md §3): the shared
 * Lambdas have no rights on any tenant table. They assume this role with the session tag
 * `tenant`, and the role's policy resolves table name and upload prefix from that tag — a
 * wrong key in the code can at worst reach the caller's own tenant, never another one.
 */
export class TenantData extends Construct {
  readonly role: Role;
  readonly scheduleGroup: CfnScheduleGroup;

  constructor(scope: Construct, id: string, props: { uploadBucket: IBucket }) {
    super(scope, id);
    const { region, account } = Stack.of(this);
    const tag = "${aws:PrincipalTag/tenant}";

    // Only roles of the portal's own stacks may assume it, and only with a pass tenant tag.
    const principal = new SessionTagsPrincipal(new AccountPrincipal(Aws.ACCOUNT_ID)).withConditions(
      {
        ArnLike: {
          "aws:PrincipalArn": [
            `arn:aws:iam::${account}:role/KundenportalApp-*`,
            `arn:aws:iam::${account}:role/KundenportalBase-*`,
          ],
        },
        StringLike: { "aws:RequestTag/tenant": PASS_TENANT_PATTERN },
      },
    );

    this.role = new Role(this, "Role", {
      assumedBy: principal,
      description: "Per-tenant data access of the shared Lambdas (session tag tenant)",
      inlinePolicies: {
        tenant: new PolicyDocument({
          statements: [
            new PolicyStatement({
              sid: "OwnTenantTable",
              actions: [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:BatchGetItem",
                "dynamodb:BatchWriteItem",
                "dynamodb:ConditionCheckItem",
                "dynamodb:DescribeTable",
              ],
              resources: [
                `arn:aws:dynamodb:${region}:${account}:table/${TENANT_TABLE_PREFIX}${tag}`,
              ],
            }),
            new PolicyStatement({
              sid: "OwnTenantUploads",
              actions: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
              resources: [props.uploadBucket.arnForObjects(`uploads/${tag}/*`)],
            }),
            new PolicyStatement({
              sid: "ListOwnTenantUploads",
              effect: Effect.ALLOW,
              actions: ["s3:ListBucket"],
              resources: [props.uploadBucket.bucketArn],
              conditions: { StringLike: { "s3:prefix": [`uploads/${tag}/*`] } },
            }),
          ],
        }),
      },
    });

    this.scheduleGroup = new CfnScheduleGroup(this, "PassSchedules", {
      name: PASS_SCHEDULE_GROUP,
    });
  }
}
