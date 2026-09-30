import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { BaseStack } from "../lib/base-stack.js";
import { loadConfig } from "../lib/config.js";
import { PARAM } from "../lib/parameters.js";

let base: Template;

beforeAll(() => {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [], reservedConcurrency: 2 } });
  const env = { account: "123456789012", region: "eu-central-1" };
  base = Template.fromStack(new BaseStack(app, "Base", { env, config: loadConfig(app) }));
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
});
