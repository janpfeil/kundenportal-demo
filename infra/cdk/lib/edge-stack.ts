import path from "node:path";
import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  CachePolicy,
  type CfnDistribution,
  CfnOriginAccessControl,
  Distribution,
  HttpVersion,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { CfnPermission } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import { REPO_ROOT } from "./functions.js";
import { PARAM } from "./parameters.js";

export interface EdgeStackProps extends StackProps {
  domainName: string;
  certificate: ICertificate;
}

/**
 * Long-lived edge: one CloudFront distribution under the portal's domain, so the owner's
 * DNS record never changes. Its origins come from SSM parameters the application stack
 * writes; the deploy script updates this stack after every application deployment
 * (`cdk deploy --force`), which points the same distribution at the new origins.
 *
 * `/` → shell function URL (origin access control), `/_next/static/*` → S3, `/api/*` → HTTP API.
 */
export class EdgeStack extends Stack {
  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);
    const param = (name: string) => StringParameter.valueForStringParameter(this, name);

    const assets = new Bucket(this, "StaticAssets", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const shellOac = new CfnOriginAccessControl(this, "ShellOac", {
      originAccessControlConfig: {
        name: `${id}-shell`,
        description: "Signs requests to the shell's Lambda function URL",
        originAccessControlOriginType: "lambda",
        signingBehavior: "always",
        signingProtocol: "sigv4",
      },
    });

    const distribution = new Distribution(this, "Distribution", {
      comment: "Kundenportal demo",
      priceClass: PriceClass.PRICE_CLASS_100,
      httpVersion: HttpVersion.HTTP2_AND_3,
      domainNames: [props.domainName],
      certificate: props.certificate,
      defaultBehavior: {
        origin: new HttpOrigin(param(PARAM.app.shellOriginDomain), {
          protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
        }),
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
          origin: new HttpOrigin(param(PARAM.app.apiOriginDomain), {
            protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });
    // The shell origin is the default behaviour's origin, which CDK renders first.
    (distribution.node.defaultChild as CfnDistribution).addPropertyOverride(
      "DistributionConfig.Origins.0.OriginAccessControlId",
      shellOac.attrId,
    );

    // CloudFront may invoke the current shell function through its URL, and only that way.
    // Function URLs need both permissions since October 2025
    // (https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html).
    const shellFunction = param(PARAM.app.shellFunctionArn);
    const sourceArn = this.formatArn({
      service: "cloudfront",
      region: "",
      resource: "distribution",
      resourceName: distribution.distributionId,
    });
    new CfnPermission(this, "ShellInvokeUrlFromCloudFront", {
      action: "lambda:InvokeFunctionUrl",
      functionName: shellFunction,
      principal: "cloudfront.amazonaws.com",
      sourceArn,
      functionUrlAuthType: "AWS_IAM",
    });
    new CfnPermission(this, "ShellInvokeFromCloudFront", {
      action: "lambda:InvokeFunction",
      functionName: shellFunction,
      principal: "cloudfront.amazonaws.com",
      sourceArn,
      invokedViaFunctionUrl: true,
    });

    new BucketDeployment(this, "DeployStatic", {
      sources: [Source.asset(path.join(REPO_ROOT, "apps", "shell", ".next", "static"))],
      destinationBucket: assets,
      destinationKeyPrefix: "_next/static",
      // Old hashed files stay so pages opened before a deployment keep working.
      prune: false,
      memoryLimit: 256,
      logGroup: new LogGroup(this, "DeployStaticLogs", {
        retention: RetentionDays.THREE_DAYS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    new CfnOutput(this, "PortalUrl", { value: `https://${props.domainName}` });
    new CfnOutput(this, "DistributionDomain", {
      value: distribution.distributionDomainName,
      description:
        "Target of the CNAME record for the portal's domain (stable across app redeploys)",
    });
  }
}
