import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { beforeAll, describe, expect, it } from "vitest";
import { AppStack } from "../lib/app-stack.js";
import { BaseStack } from "../lib/base-stack.js";
import { loadConfig } from "../lib/config.js";
import { EdgeStack } from "../lib/edge-stack.js";
import { PARAM } from "../lib/parameters.js";
import { ZONES, zoneParams } from "../lib/zones.js";
import { loadApiRoutes } from "@kundenportal/api-contract/routes";

let base: Template;
let application: Template;
let edge: Template;
const all = () => [base, application, edge];

beforeAll(() => {
  // Skip esbuild bundling in unit tests; the real build synthesises with bundling.
  const app = new App({ context: { "aws:cdk:bundling-stacks": [], reservedConcurrency: 2 } });
  const env = { account: "123456789012", region: "eu-central-1" };
  const config = loadConfig(app);
  const certStack = new Stack(app, "Cert", {
    env: { ...env, region: "us-east-1" },
    crossRegionReferences: true,
  });
  const certificate = new Certificate(certStack, "Cert", { domainName: config.domainName });
  const baseStack = new BaseStack(app, "Base", { env, config });
  const appStack = new AppStack(app, "App", { env, config });
  const edgeStack = new EdgeStack(app, "Edge", {
    env,
    crossRegionReferences: true,
    domainName: config.domainName,
    certificate,
  });
  base = Template.fromStack(baseStack);
  application = Template.fromStack(appStack);
  edge = Template.fromStack(edgeStack);
});

const resourceTypes = (template: Template) =>
  Object.values(template.toJSON().Resources as Record<string, { Type: string }>).map((r) => r.Type);

describe("stack split", () => {
  it("keeps what costs nothing idle in the long-lived stacks and the rest in the app stack", () => {
    expect(resourceTypes(base)).toEqual(
      expect.arrayContaining(["AWS::Cognito::UserPool", "AWS::DynamoDB::Table"]),
    );
    expect(resourceTypes(edge)).toContain("AWS::CloudFront::Distribution");
    expect(resourceTypes(application)).toEqual(
      expect.arrayContaining([
        "AWS::ApiGatewayV2::Api",
        "AWS::Events::EventBus",
        "AWS::SQS::Queue",
      ]),
    );
    expect(resourceTypes(application)).not.toContain("AWS::CloudFront::Distribution");
    expect(resourceTypes(application)).not.toContain("AWS::Cognito::UserPool");
  });

  it("couples the stacks only through SSM parameters, never CloudFormation exports", () => {
    for (const template of all()) {
      const outputs = Object.values(
        (template.toJSON().Outputs ?? {}) as Record<string, { Export?: unknown }>,
      );
      expect(outputs.filter((output) => output.Export)).toEqual([]);
      expect(JSON.stringify(template.toJSON())).not.toContain("Fn::ImportValue");
    }
    const written = (template: Template) =>
      Object.values(template.findResources("AWS::SSM::Parameter")).map((r) => r.Properties.Name);
    expect(written(base)).toEqual(expect.arrayContaining(Object.values(PARAM.base)));
    expect(written(application)).toEqual(expect.arrayContaining(Object.values(PARAM.app)));
  });
});

describe("guard rails", () => {
  it("runs every own function on Node.js 24, arm64, with reserved concurrency and 3-day logs", () => {
    const own = (template: Template) =>
      Object.keys(
        template.findResources("AWS::Lambda::Function", {
          Properties: {
            Runtime: "nodejs24.x",
            Architectures: ["arm64"],
            ReservedConcurrentExecutions: 2,
          },
        }),
      ).length;
    expect(own(base)).toBe(1);
    // customer, notification API + consumer, shell, the zones, and API + worker for
    // contract, consumption and documents
    expect(own(application)).toBe(10 + ZONES.length);
    for (const template of all())
      template.allResourcesProperties("AWS::Logs::LogGroup", { RetentionInDays: 3 });
  });

  it("creates no VPC, NAT, load balancer, RDS or WAF", () => {
    for (const template of all()) {
      expect(
        resourceTypes(template).filter((type) =>
          /EC2::(VPC|NatGateway)|ElasticLoadBalancing|RDS::|WAFv2::/.test(type),
        ),
      ).toEqual([]);
    }
  });

  it("keeps DynamoDB inside the always-free provisioned capacity", () => {
    base.hasResourceProperties("AWS::DynamoDB::Table", {
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    });
  });

  it("deletes stateful resources on destroy, including non-empty buckets", () => {
    for (const template of all()) {
      for (const type of [
        "AWS::Cognito::UserPool",
        "AWS::S3::Bucket",
        "AWS::Logs::LogGroup",
        "AWS::DynamoDB::Table",
      ]) {
        for (const resource of Object.values(template.findResources(type)))
          expect(resource.DeletionPolicy).toBe("Delete");
      }
    }
    expect(resourceTypes(edge)).toContain("Custom::S3AutoDeleteObjects");
  });
});

describe("identity", () => {
  it("uses Cognito Essentials with e-mail sign-up and a confidential code+PKCE client", () => {
    base.hasResourceProperties("AWS::Cognito::UserPool", {
      UserPoolTier: "ESSENTIALS",
      AutoVerifiedAttributes: ["email"],
      LambdaConfig: { PreTokenGenerationConfig: { LambdaVersion: "V2_0" } },
    });
    base.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: true,
      AllowedOAuthFlows: ["code"],
      CallbackURLs: [
        "https://kundenportal-demo.rypox.com/auth/callback",
        "http://localhost:3000/auth/callback",
      ],
      WriteAttributes: Match.not(Match.arrayWith(["custom:tenant_id"])),
    });
    base.hasResourceProperties("AWS::Cognito::UserPoolDomain", { ManagedLoginVersion: 2 });
  });
});

describe("api and events", () => {
  it("protects every route with the JWT authorizer and the contract's scopes", () => {
    const routes = Object.values(application.findResources("AWS::ApiGatewayV2::Route"));
    expect(routes).toHaveLength(loadApiRoutes().length);
    for (const route of routes) {
      expect(route.Properties.AuthorizationType).toBe("JWT");
      expect(route.Properties.AuthorizationScopes.length).toBeGreaterThan(0);
    }
    application.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      StageName: "api",
      DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
    });
  });

  it("routes CustomerRegistered from the own bus to SQS with a DLQ", () => {
    application.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: { source: ["kundenportal.customer"], "detail-type": ["CustomerRegistered"] },
    });
    application.hasResourceProperties("AWS::SQS::Queue", { RedrivePolicy: { maxReceiveCount: 3 } });
    application.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
      FunctionResponseTypes: ["ReportBatchItemFailures"],
    });
  });
});

describe("domain services", () => {
  const routeScopes = () =>
    Object.values(application.findResources("AWS::ApiGatewayV2::Route")).map(
      (route) => `${route.Properties.RouteKey} ${route.Properties.AuthorizationScopes.join(",")}`,
    );

  it("serves contracts, readings and documents with their scopes", () => {
    expect(routeScopes()).toEqual(
      expect.arrayContaining([
        "GET /contracts kundenportal/contracts.read",
        "GET /contracts/{contractId} kundenportal/contracts.read",
        "PATCH /contracts/{contractId} kundenportal/contracts.write",
        "GET /contracts/{contractId}/readings kundenportal/readings.read",
        "POST /contracts/{contractId}/readings kundenportal/readings.write",
        "GET /contracts/{contractId}/usage kundenportal/readings.read",
        "GET /documents kundenportal/documents.read",
        "POST /documents/upload-url kundenportal/documents.write",
      ]),
    );
  });

  it("offers the new scopes on the Cognito resource server", () => {
    base.hasResourceProperties("AWS::Cognito::UserPoolResourceServer", {
      Identifier: "kundenportal",
      Scopes: Match.arrayWith(
        ["contracts.read", "documents.write", "readings.write"].map((name) =>
          Match.objectLike({ ScopeName: name }),
        ),
      ),
    });
  });

  it("keeps notification the only polled queue and gives every DLQ an alarm", () => {
    // Every SQS event source polls around the clock (≈ 0.65 M requests a month); a
    // second one would leave the 1 M free SQS requests.
    const queues = Object.values(application.findResources("AWS::SQS::Queue"));
    const sources = queues.filter((queue) => queue.Properties.RedrivePolicy);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.Properties.RedrivePolicy.maxReceiveCount).toBe(3);
    // DLQs of notification, contract, consumption and documents
    expect(queues.length - sources.length).toBe(4);
    expect(Object.keys(application.findResources("AWS::CloudWatch::Alarm"))).toHaveLength(4);
    const mappings = Object.values(application.findResources("AWS::Lambda::EventSourceMapping"));
    expect(mappings).toHaveLength(1);
    expect(mappings[0]?.Properties.FunctionResponseTypes).toEqual(["ReportBatchItemFailures"]);
  });

  it("invokes the domain workers directly with retries and a DLQ on every rule target", () => {
    const rules = Object.values(application.findResources("AWS::Events::Rule"));
    const lambdaTargets = rules
      .flatMap((rule) => rule.Properties.Targets as Record<string, unknown>[])
      .filter((target) => !JSON.stringify(target.Arn).includes("NotificationQueue"));
    // contract 2, consumption 2, documents 2 (CustomerRegistered, S3 upload)
    expect(lambdaTargets).toHaveLength(6);
    for (const target of lambdaTargets) {
      expect(target.RetryPolicy).toEqual({
        MaximumRetryAttempts: 8,
        MaximumEventAgeInSeconds: 86400,
      });
      expect(target.DeadLetterConfig).toBeDefined();
    }
  });

  it("routes each event only to the domains that react to it", () => {
    const rules = Object.values(application.findResources("AWS::Events::Rule")).map((rule) =>
      [rule.Properties.EventPattern.source[0], rule.Properties.EventPattern["detail-type"][0]].join(
        " ",
      ),
    );
    const count = (pattern: string) => rules.filter((rule) => rule === pattern).length;
    // notification, contract, consumption, documents
    expect(count("kundenportal.customer CustomerRegistered")).toBe(4);
    // notification, contract
    expect(count("kundenportal.consumption MeterReadingSubmitted")).toBe(2);
    // notification, consumption (projection)
    expect(count("kundenportal.contract ContractChanged")).toBe(2);
    for (const pattern of [
      "kundenportal.contract InstallmentAdjusted",
      "kundenportal.consumption DataVolumeThresholdReached",
      "kundenportal.documents DocumentUploaded",
      "aws.s3 Object Created",
    ])
      expect(count(pattern)).toBe(1);
  });

  it("hands failed asynchronous invocations of the workers to a DLQ", () => {
    const configs = Object.values(application.findResources("AWS::Lambda::EventInvokeConfig"));
    expect(configs).toHaveLength(3); // contract, consumption, documents
    for (const config of configs) {
      expect(config.Properties.MaximumRetryAttempts).toBe(2);
      expect(config.Properties.DestinationConfig.OnFailure.Destination).toBeDefined();
    }
  });

  it("checks data volumes daily with EventBridge Scheduler", () => {
    application.hasResourceProperties("AWS::Scheduler::Schedule", {
      ScheduleExpression: "cron(0 7 * * ? *)",
      ScheduleExpressionTimezone: "Europe/Berlin",
      State: "ENABLED",
      Target: Match.objectLike({
        Input: JSON.stringify({ task: "checkDataVolumes" }),
        RetryPolicy: { MaximumRetryAttempts: 2, MaximumEventAgeInSeconds: 3600 },
        DeadLetterConfig: Match.objectLike({ Arn: Match.anyValue() }),
      }),
    });
  });

  it("lets the documents API only put and the worker only delete uploads", () => {
    const statements = Object.values(application.findResources("AWS::IAM::Policy")).flatMap(
      (policy) => policy.Properties.PolicyDocument.Statement as { Action: string | string[] }[],
    );
    const s3Actions = statements
      .flatMap((statement) => [statement.Action].flat())
      .filter((action) => action.startsWith("s3:"));
    expect(new Set(s3Actions)).toEqual(
      new Set([
        "s3:PutObject",
        "s3:PutObjectLegalHold",
        "s3:PutObjectRetention",
        "s3:PutObjectTagging",
        "s3:PutObjectVersionTagging",
        "s3:Abort*",
        "s3:DeleteObject*",
      ]),
    );
  });
});

describe("uploads", () => {
  it("keeps the upload bucket in the long-lived base: private, encrypted, TLS only", () => {
    expect(resourceTypes(application)).not.toContain("AWS::S3::Bucket");
    base.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
        ],
      },
      NotificationConfiguration: { EventBridgeConfiguration: { EventBridgeEnabled: true } },
      Tags: Match.arrayWith([{ Key: "project", Value: "kundenportal-demo" }]),
    });
    base.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Deny",
            Condition: { Bool: { "aws:SecureTransport": "false" } },
          }),
        ]),
      },
    });
    expect(resourceTypes(base)).toContain("Custom::S3AutoDeleteObjects");
  });

  it("allows only PUT from the portal and localhost and deletes uploads after 7 days", () => {
    base.hasResourceProperties("AWS::S3::Bucket", {
      CorsConfiguration: {
        CorsRules: [
          Match.objectLike({
            AllowedMethods: ["PUT"],
            AllowedOrigins: ["https://kundenportal-demo.rypox.com", "http://localhost:3000"],
            AllowedHeaders: ["content-type"],
          }),
        ],
      },
      LifecycleConfiguration: {
        Rules: [
          Match.objectLike({
            ExpirationInDays: 7,
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
            Status: "Enabled",
          }),
        ],
      },
    });
  });
});

describe("edge", () => {
  it("serves shell, static files and API under the portal domain", () => {
    edge.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        Aliases: ["kundenportal-demo.rypox.com"],
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: "/_next/static/*" }),
          Match.objectLike({ PathPattern: "/api/*" }),
        ]),
      },
    });
    application.hasResourceProperties("AWS::Lambda::Url", {
      AuthType: "AWS_IAM",
      InvokeMode: "RESPONSE_STREAM",
    });
  });

  it("signs requests to the shell (first origin) with a Lambda origin access control", () => {
    edge.hasResourceProperties("AWS::CloudFront::OriginAccessControl", {
      OriginAccessControlConfig: {
        OriginAccessControlOriginType: "lambda",
        SigningBehavior: "always",
      },
    });
    const distribution = Object.values(edge.findResources("AWS::CloudFront::Distribution"))[0];
    const config = distribution?.Properties.DistributionConfig;
    const shellOriginId = config.DefaultCacheBehavior.TargetOriginId;
    const shellOrigin = config.Origins[0];
    expect(shellOrigin.Id).toBe(shellOriginId);
    expect(shellOrigin.OriginAccessControlId).toBeDefined();
  });

  it("lets CloudFront invoke the shell only through its URL", () => {
    for (const action of ["lambda:InvokeFunctionUrl", "lambda:InvokeFunction"]) {
      edge.hasResourceProperties("AWS::Lambda::Permission", {
        Action: action,
        Principal: "cloudfront.amazonaws.com",
      });
    }
    edge.hasResourceProperties("AWS::Lambda::Permission", {
      Action: "lambda:InvokeFunction",
      InvokedViaFunctionUrl: true,
    });
  });
});

describe("zones", () => {
  it("gives every zone its own function and publishes its origin for the edge", () => {
    const names = Object.values(application.findResources("AWS::SSM::Parameter")).map(
      (r) => r.Properties.Name,
    );
    for (const zone of ZONES) {
      expect(names).toEqual(expect.arrayContaining(Object.values(zoneParams(zone))));
    }
    application.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({ AWS_LWA_READINESS_CHECK_PATH: "/vertraege/healthz" }),
      },
    });
  });

  it("routes each zone path to its own origin, caches its static files and allows writes", () => {
    const config = Object.values(edge.findResources("AWS::CloudFront::Distribution"))[0]?.Properties
      .DistributionConfig;
    for (const zone of ZONES) {
      const behaviours = config.CacheBehaviors.filter((b: { PathPattern: string }) =>
        [zone.basePath, `${zone.basePath}/*`, `${zone.basePath}/_next/static/*`].includes(
          b.PathPattern,
        ),
      );
      expect(behaviours).toHaveLength(3);
      const dynamic = behaviours.find(
        (b: { PathPattern: string }) => b.PathPattern === `${zone.basePath}/*`,
      );
      expect(dynamic.AllowedMethods).toContain("POST");
    }
    expect(config.DefaultCacheBehavior.AllowedMethods).toContain("PATCH");
    // Shell and zone origins are signed with origin access control (plus the S3 origin).
    const lambdaOrigins = config.Origins.filter(
      (o: { OriginAccessControlId?: unknown }) => o.OriginAccessControlId,
    );
    expect(lambdaOrigins.length).toBeGreaterThanOrEqual(1 + ZONES.length + 1);
  });

  it("lets CloudFront invoke every zone function only through its URL", () => {
    const permissions = Object.values(edge.findResources("AWS::Lambda::Permission"));
    expect(permissions.filter((p) => p.Properties.InvokedViaFunctionUrl === true)).toHaveLength(
      1 + ZONES.length,
    );
  });
});

describe("runtime widget", () => {
  it("publishes the bell under /widgets/ and invalidates it on deploy", () => {
    const config = Object.values(edge.findResources("AWS::CloudFront::Distribution"))[0]?.Properties
      .DistributionConfig;
    expect(config.CacheBehaviors.map((b: { PathPattern: string }) => b.PathPattern)).toContain(
      "/widgets/*",
    );
    edge.hasResourceProperties("Custom::CDKBucketDeployment", {
      DestinationBucketKeyPrefix: "widgets",
      DistributionPaths: ["/widgets/*"],
    });
  });
});
