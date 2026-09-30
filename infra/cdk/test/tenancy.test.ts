import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { AppStack } from "../lib/app-stack.js";
import { BaseStack } from "../lib/base-stack.js";
import { loadConfig } from "../lib/config.js";
import { PARAM } from "../lib/parameters.js";

let base: Template;
let application: Template;

beforeAll(() => {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [], reservedConcurrency: 2 } });
  const env = { account: "123456789012", region: "eu-central-1" };
  const config = loadConfig(app);
  const baseStack = new BaseStack(app, "Base", { env, config });
  const appStack = new AppStack(app, "App", { env, config });
  base = Template.fromStack(baseStack);
  application = Template.fromStack(appStack);
});

describe("demo-pass tenants (phase 4)", () => {
  it("lets only the portal's own roles assume the tenant role, with a pass tenant tag", () => {
    base.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ["sts:AssumeRole", "sts:TagSession"],
            Condition: {
              ArnLike: {
                "aws:PrincipalArn": [
                  "arn:aws:iam::123456789012:role/KundenportalApp-*",
                  "arn:aws:iam::123456789012:role/KundenportalBase-*",
                ],
              },
              StringLike: { "aws:RequestTag/tenant": "p???????" },
            },
          }),
        ]),
      },
    });
  });

  it("resolves the table and the upload prefix only from the session tag", () => {
    const roles = base.findResources("AWS::IAM::Role", {
      Properties: { Description: Match.stringLikeRegexp("session tag tenant") },
    });
    const [role] = Object.values(roles) as { Properties: { Policies: unknown[] } }[];
    const policy = JSON.stringify(role?.Properties.Policies);
    expect(policy).toContain("table/kp-tenant-${aws:PrincipalTag/tenant}");
    expect(policy).toContain("/uploads/${aws:PrincipalTag/tenant}/*");
    expect(policy).not.toMatch(/table\/kp-tenant-\*/);
    expect(policy).not.toContain("dynamodb:CreateTable");
  });

  it("keeps the expiry schedules and the pass group in the long-lived base", () => {
    base.hasResourceProperties("AWS::Scheduler::ScheduleGroup", { Name: "kundenportal-passes" });
    base.hasResourceProperties("AWS::Cognito::UserPoolGroup", { GroupName: "pass" });
    for (const name of [PARAM.base.tenantDataRoleArn, PARAM.base.passScheduleGroup]) {
      base.hasResourceProperties("AWS::SSM::Parameter", { Name: name });
    }
  });

  it("gives every service except tenancy the tenant role, never direct tenant table rights", () => {
    const functions = Object.entries(application.findResources("AWS::Lambda::Function"));
    const vending = functions.filter(
      ([, fn]) => fn.Properties.Environment?.Variables?.TENANT_DATA_ROLE_ARN,
    );
    // customer 2, notification 2, contract 2, consumption 2, documents 2, migration 3
    expect(vending).toHaveLength(13);
    expect(vending.some(([id]) => id.startsWith("Tenancy"))).toBe(false);
    const policies = JSON.stringify(application.findResources("AWS::IAM::Policy"));
    expect(policies).toContain("sts:TagSession");
    // Only the tenancy worker creates and deletes tenant tables.
    const tableAdmins = Object.values(application.findResources("AWS::IAM::Policy")).filter(
      (policy) => JSON.stringify(policy.Properties.PolicyDocument).includes("dynamodb:CreateTable"),
    );
    expect(tableAdmins).toHaveLength(1);
    expect(JSON.stringify(tableAdmins[0]?.Properties.Roles)).toContain("TenancyWorker");
  });

  it("expires passes with one-time schedules and reconciles daily", () => {
    application.hasResourceProperties("AWS::Scheduler::Schedule", {
      ScheduleExpression: "cron(30 3 * * ? *)",
      Target: Match.objectLike({ Input: JSON.stringify({ task: "reconcile" }) }),
    });
    application.hasResourceProperties("AWS::SNS::Subscription", {
      Protocol: "lambda",
      TopicArn: Match.objectLike({}),
    });
  });

  it("tears all pass tenants down before the base stack's table, pool and bucket go", () => {
    const [resource] = Object.values(base.findResources("Custom::PassTenantCleanup"));
    const dependsOn = (resource?.DependsOn ?? []) as string[];
    for (const prefix of ["Table", "IdentityUserPool", "UploadsBucket", "TenantDataPassSchedules"])
      expect(dependsOn.some((id) => id.startsWith(prefix))).toBe(true);
  });
});
