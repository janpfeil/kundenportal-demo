import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../lib/config.js";
import { PortalStack } from "../lib/portal-stack.js";

let template: Template;

beforeAll(() => {
  // Skip esbuild bundling in unit tests; the real build synthesises with bundling.
  const app = new App({ context: { "aws:cdk:bundling-stacks": [], reservedConcurrency: 2 } });
  const env = { account: "123456789012", region: "eu-central-1" };
  const certStack = new Stack(app, "Cert", {
    env: { ...env, region: "us-east-1" },
    crossRegionReferences: true,
  });
  const certificate = new Certificate(certStack, "Cert", {
    domainName: "kundenportal-demo.rypox.com",
  });
  const stack = new PortalStack(app, "Portal", {
    env,
    crossRegionReferences: true,
    certificate,
    config: loadConfig(app),
  });
  template = Template.fromStack(stack);
});

describe("guard rails", () => {
  it("runs every own function on Node.js 24, arm64, with reserved concurrency and 3-day logs", () => {
    const functions = template.findResources("AWS::Lambda::Function", {
      Properties: {
        Runtime: "nodejs24.x",
        Architectures: ["arm64"],
        ReservedConcurrentExecutions: 2,
      },
    });
    expect(Object.keys(functions)).toHaveLength(5);
    template.allResourcesProperties("AWS::Logs::LogGroup", { RetentionInDays: 3 });
  });

  it("creates no VPC, NAT, load balancer, RDS or WAF", () => {
    const types = Object.values(
      template.toJSON().Resources as Record<string, { Type: string }>,
    ).map((r) => r.Type);
    expect(
      types.filter((type) => /EC2::(VPC|NatGateway)|ElasticLoadBalancing|RDS::|WAFv2::/.test(type)),
    ).toEqual([]);
  });

  it("keeps DynamoDB inside the always-free provisioned capacity and deletes it on destroy", () => {
    template.hasResource("AWS::DynamoDB::Table", {
      Properties: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
      DeletionPolicy: "Delete",
    });
  });

  it("deletes stateful resources on destroy", () => {
    for (const type of ["AWS::Cognito::UserPool", "AWS::S3::Bucket", "AWS::Logs::LogGroup"]) {
      for (const resource of Object.values(template.findResources(type))) {
        expect(resource.DeletionPolicy).toBe("Delete");
      }
    }
  });
});

describe("identity", () => {
  it("uses Cognito Essentials with e-mail sign-up and a confidential code+PKCE client", () => {
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      UserPoolTier: "ESSENTIALS",
      AutoVerifiedAttributes: ["email"],
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
    });
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: true,
      AllowedOAuthFlows: ["code"],
      CallbackURLs: [
        "https://kundenportal-demo.rypox.com/auth/callback",
        "http://localhost:3000/auth/callback",
      ],
      WriteAttributes: Match.not(Match.arrayWith(["custom:tenant_id"])),
    });
    template.hasResourceProperties("AWS::Cognito::UserPoolDomain", { ManagedLoginVersion: 2 });
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      LambdaConfig: { PreTokenGenerationConfig: { LambdaVersion: "V2_0" } },
    });
  });
});

describe("api and events", () => {
  it("protects every route with the JWT authorizer and the contract's scopes", () => {
    const routes = Object.values(template.findResources("AWS::ApiGatewayV2::Route"));
    expect(routes).toHaveLength(4);
    for (const route of routes) {
      expect(route.Properties.AuthorizationType).toBe("JWT");
      expect(route.Properties.AuthorizationScopes.length).toBeGreaterThan(0);
    }
    template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      StageName: "api",
      DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
    });
  });

  it("routes CustomerRegistered from the own bus to SQS with a DLQ", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: { source: ["kundenportal.customer"], "detail-type": ["CustomerRegistered"] },
    });
    template.hasResourceProperties("AWS::SQS::Queue", { RedrivePolicy: { maxReceiveCount: 3 } });
    template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
      FunctionResponseTypes: ["ReportBatchItemFailures"],
    });
  });
});

describe("edge", () => {
  it("serves the shell, static files and the API through one distribution", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        Aliases: ["kundenportal-demo.rypox.com"],
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: "/_next/static/*" }),
          Match.objectLike({ PathPattern: "/api/*" }),
        ]),
      },
    });
    template.hasResourceProperties("AWS::Lambda::Url", {
      AuthType: "AWS_IAM",
      InvokeMode: "RESPONSE_STREAM",
    });
  });
});
