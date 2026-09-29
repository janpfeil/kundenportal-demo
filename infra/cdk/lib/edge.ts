import { existsSync } from "node:fs";
import path from "node:path";
import { Duration, Fn, RemovalPolicy, Stack } from "aws-cdk-lib";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  HttpVersion,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { FunctionUrlOrigin, HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  CfnPermission,
  Code,
  Function as LambdaFunction,
  FunctionUrlAuthType,
  InvokeMode,
  LayerVersion,
} from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import { baseFunctionProps, REPO_ROOT } from "./functions.js";

/** Lambda Web Adapter layer published by AWS (https://github.com/awslabs/aws-lambda-web-adapter). */
export const WEB_ADAPTER_LAYER_VERSION = 30;
const WEB_ADAPTER_ACCOUNT = "753240598075";

export interface EdgeProps {
  domainName: string;
  certificate?: ICertificate;
  reservedConcurrency: number;
  /** Environment of the shell (API URL, OIDC settings). */
  shellEnvironment: Record<string, string>;
  /** ARN of the user pool whose client secret the shell may read. */
  userPoolArn: string;
  /** Base URL of the HTTP API stage, e.g. https://abc.execute-api.eu-central-1.amazonaws.com/api */
  apiUrl: string;
}

/**
 * Shell zone (Next.js standalone in Lambda via the Lambda Web Adapter) behind CloudFront:
 * `/` → shell function URL, `/_next/static/*` → S3, `/api/*` → HTTP API.
 */
export class Edge extends Construct {
  readonly distribution: Distribution;
  readonly shell: LambdaFunction;

  constructor(scope: Construct, id: string, props: EdgeProps) {
    super(scope, id);
    const shellDir = path.join(REPO_ROOT, "apps", "shell");
    // Built by apps/shell/scripts/package-lambda.mjs; the zip keeps pnpm's symlinks.
    const shellZip = path.join(shellDir, ".next", "shell-lambda.zip");
    if (!existsSync(shellZip)) {
      throw new Error(`Shell build missing at ${shellZip}; run "pnpm build" first`);
    }
    const region = Stack.of(this).region;

    this.shell = new LambdaFunction(this, "Shell", {
      ...baseFunctionProps(this, "Shell", props.reservedConcurrency),
      description: "Shell zone (Next.js standalone server)",
      code: Code.fromAsset(shellZip),
      handler: "run.sh",
      memorySize: 1024,
      timeout: Duration.seconds(15),
      layers: [
        LayerVersion.fromLayerVersionArn(
          this,
          "WebAdapter",
          `arn:aws:lambda:${region}:${WEB_ADAPTER_ACCOUNT}:layer:LambdaAdapterLayerArm64:${WEB_ADAPTER_LAYER_VERSION}`,
        ),
      ],
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
        AWS_LWA_INVOKE_MODE: "response_stream",
        AWS_LWA_READINESS_CHECK_PATH: "/healthz",
        PORT: "3000",
        NODE_ENV: "production",
        APP_URL: `https://${props.domainName}`,
        ...props.shellEnvironment,
      },
    });
    this.shell.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["cognito-idp:DescribeUserPoolClient"],
        resources: [props.userPoolArn],
      }),
    );
    const shellUrl = this.shell.addFunctionUrl({
      authType: FunctionUrlAuthType.AWS_IAM,
      invokeMode: InvokeMode.RESPONSE_STREAM,
    });

    const assets = new Bucket(this, "StaticAssets", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const apiDomain = Fn.select(2, Fn.split("/", props.apiUrl));
    this.distribution = new Distribution(this, "Distribution", {
      comment: "Kundenportal demo",
      priceClass: PriceClass.PRICE_CLASS_100,
      httpVersion: HttpVersion.HTTP2_AND_3,
      ...(props.certificate
        ? { domainNames: [props.domainName], certificate: props.certificate }
        : {}),
      defaultBehavior: {
        origin: FunctionUrlOrigin.withOriginAccessControl(shellUrl),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // GET only: origin access control cannot sign request bodies for Lambda URLs.
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        "/_next/static/*": {
          origin: S3BucketOrigin.withOriginAccessControl(assets),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
        },
        "/api/*": {
          origin: new HttpOrigin(apiDomain, { protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY }),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // Since October 2025 function URLs also need lambda:InvokeFunction; CDK's OAC origin
    // only grants lambda:InvokeFunctionUrl (https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html).
    new CfnPermission(this, "ShellInvokeFromCloudFront", {
      action: "lambda:InvokeFunction",
      functionName: this.shell.functionName,
      principal: "cloudfront.amazonaws.com",
      sourceArn: Stack.of(this).formatArn({
        service: "cloudfront",
        region: "",
        resource: "distribution",
        resourceName: this.distribution.distributionId,
      }),
      invokedViaFunctionUrl: true,
    });

    const sources = [Source.asset(path.join(shellDir, ".next", "static"))];
    new BucketDeployment(this, "DeployStatic", {
      sources,
      destinationBucket: assets,
      destinationKeyPrefix: "_next/static",
      // Old hashed files stay until the next deployment so open pages keep working.
      prune: false,
      memoryLimit: 256,
      logGroup: new LogGroup(this, "DeployStaticLogs", {
        retention: RetentionDays.THREE_DAYS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
  }
}
