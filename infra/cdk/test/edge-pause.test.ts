import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { beforeAll, describe, expect, it } from "vitest";
import { EdgeStack } from "../lib/edge-stack.js";
import { PAUSE_HTML, pauseFunctionCode } from "../lib/pause-page.js";

let paused: Template;

beforeAll(() => {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  const env = { account: "123456789012", region: "eu-central-1" };
  const certStack = new Stack(app, "Cert", {
    env: { ...env, region: "us-east-1" },
    crossRegionReferences: true,
  });
  const certificate = new Certificate(certStack, "Cert", {
    domainName: "kundenportal-demo.rypox.com",
  });
  paused = Template.fromStack(
    new EdgeStack(app, "Edge", {
      env,
      crossRegionReferences: true,
      domainName: "kundenportal-demo.rypox.com",
      certificate,
      paused: true,
    }),
  );
});

describe("paused edge", () => {
  it("keeps the distribution but reads nothing of the removed app stack", () => {
    paused.resourceCountIs("AWS::CloudFront::Distribution", 1);
    const json = JSON.stringify(paused.toJSON());
    expect(json).not.toContain("/kundenportal/app/");
    expect(json).not.toContain("/kundenportal/zones/");
    paused.resourceCountIs("AWS::Lambda::Permission", 0);
  });

  it("answers pages and API calls with the pause function, static files from S3", () => {
    paused.hasResourceProperties("AWS::CloudFront::Function", {
      FunctionConfig: Match.objectLike({ Runtime: "cloudfront-js-2.0" }),
    });
    const [distribution] = Object.values(paused.findResources("AWS::CloudFront::Distribution")) as {
      Properties: { DistributionConfig: Record<string, unknown> };
    }[];
    const config = distribution?.Properties.DistributionConfig as {
      DefaultCacheBehavior: { FunctionAssociations?: unknown[] };
      CacheBehaviors: { PathPattern: string; FunctionAssociations?: unknown[] }[];
    };
    expect(config.DefaultCacheBehavior.FunctionAssociations).toHaveLength(1);
    const byPath = Object.fromEntries(config.CacheBehaviors.map((b) => [b.PathPattern, b]));
    expect(byPath["/api/*"]?.FunctionAssociations).toHaveLength(1);
    expect(byPath["/_next/static/*"]?.FunctionAssociations).toBeUndefined();
  });

  it("fits the pause page into a CloudFront Function and answers 503", () => {
    expect(Buffer.byteLength(pauseFunctionCode())).toBeLessThan(10_240);
    expect(pauseFunctionCode()).toContain("statusCode: 503");
    expect(PAUSE_HTML).toContain("Die Demo pausiert gerade");
    expect(PAUSE_HTML).not.toMatch(/<script|src="http/);
  });

  it("answers pages with HTML and API calls with problem details", () => {
    const handler = new Function(`${pauseFunctionCode()}; return handler;`)() as (event: {
      request: { uri: string };
    }) => {
      statusCode: number;
      headers: Record<string, { value: string }>;
      body: { data: string };
    };
    const page = handler({ request: { uri: "/vertraege" } });
    expect(page.statusCode).toBe(503);
    expect(page.headers["content-type"]?.value).toContain("text/html");
    expect(page.body.data).toBe(PAUSE_HTML);
    const api = handler({ request: { uri: "/api/me" } });
    expect(api.headers["content-type"]?.value).toBe("application/problem+json");
    expect(JSON.parse(api.body.data)).toMatchObject({ status: 503 });
  });
});
