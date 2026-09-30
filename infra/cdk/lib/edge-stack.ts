import path from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  CacheCookieBehavior,
  CacheHeaderBehavior,
  CachePolicy,
  CacheQueryStringBehavior,
  CfnOriginAccessControl,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
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
import { pauseFunctionCode } from "./pause-page.js";
import { PARAM } from "./parameters.js";
import { ZONES, zoneParams } from "./zones.js";

export interface EdgeStackProps extends StackProps {
  domainName: string;
  certificate: ICertificate;
  /**
   * The application stack is paused (teardown.sh without --all): no origin of the app
   * exists, so the edge answers every page and API call itself with a 503 page. The
   * static files stay; the distribution and its DNS name do not change.
   */
  paused?: boolean;
}

/**
 * Long-lived edge: one CloudFront distribution under the portal's domain, so the owner's
 * DNS record never changes. Its origins come from SSM parameters the application stack
 * writes; the deploy script updates this stack after every application deployment
 * (`cdk deploy --force`), which points the same distribution at the new origins.
 *
 * `/` → shell function URL (origin access control), `/_next/static/*` → S3, `/api/*` → HTTP API.
 * While paused, a CloudFront Function answers `/` and `/api/*` with 503 instead.
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

    // One origin access control signs requests to all Next.js function URLs (shell, zones).
    const lambdaOac = new CfnOriginAccessControl(this, "ShellOac", {
      originAccessControlConfig: {
        name: `${id}-shell`,
        description: "Signs requests to the Lambda function URLs of shell and zones",
        originAccessControlOriginType: "lambda",
        signingBehavior: "always",
        signingProtocol: "sigv4",
      },
    });

    const lambdaOrigin = (domain: string) =>
      new HttpOrigin(domain, {
        protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
        originAccessControlId: lambdaOac.attrId,
      });

    const assetsOrigin = S3BucketOrigin.withOriginAccessControl(assets);
    if (props.paused) {
      this.pausedDistribution(props, assets, assetsOrigin);
      return;
    }
    // The shell decides what may be cached: the prerendered public pages (`/`,
    // `/pass/einloesen`) answer `public, s-maxage=300` with the same HTML for everyone;
    // every page rendered per request answers `private, no-store`, and anything without
    // Cache-Control gets TTL 0. Cookies still reach the origin (origin request policy),
    // they are just not part of the cache key.
    const shellCache = new CachePolicy(this, "ShellCache", {
      comment: "Shell: honour the origin's Cache-Control; only public pages are cached",
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.seconds(0),
      maxTtl: Duration.seconds(300),
      cookieBehavior: CacheCookieBehavior.none(),
      headerBehavior: CacheHeaderBehavior.none(),
      // Next's in-page navigation uses ?_rsc=…, which must not share an entry with the HTML.
      queryStringBehavior: CacheQueryStringBehavior.all(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    const distribution = new Distribution(this, "Distribution", {
      comment: "Kundenportal demo",
      priceClass: PriceClass.PRICE_CLASS_100,
      httpVersion: HttpVersion.HTTP2_AND_3,
      domainNames: [props.domainName],
      certificate: props.certificate,
      defaultBehavior: {
        origin: lambdaOrigin(param(PARAM.app.shellOriginDomain)),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // Writes need the x-amz-content-sha256 header from the browser (see @kundenportal/web-auth).
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: shellCache,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        "/_next/static/*": {
          origin: assetsOrigin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
        },
        // Runtime widgets (e.g. <kp-bell>), loaded by shell and zones; invalidated on deploy.
        "/widgets/*": {
          origin: assetsOrigin,
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

    // Zones: pages and route handlers from the zone's function, static files from S3.
    for (const zone of ZONES) {
      const origin = lambdaOrigin(param(zoneParams(zone).originDomain));
      const dynamic = {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      };
      // Hashed static files of the zone come from S3 like the shell's, not from its function:
      // a first page load requests many chunks at once, which would exhaust its concurrency.
      distribution.addBehavior(`${zone.basePath}/_next/static/*`, assetsOrigin, {
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      });
      distribution.addBehavior(zone.basePath, origin, dynamic);
      distribution.addBehavior(`${zone.basePath}/*`, origin, dynamic);
    }

    // CloudFront may invoke the current shell and zone functions through their URLs, and
    // only that way. Function URLs need both permissions since October 2025
    // (https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html).
    const sourceArn = this.formatArn({
      service: "cloudfront",
      region: "",
      resource: "distribution",
      resourceName: distribution.distributionId,
    });
    const allowCloudFront = (id: string, functionArn: string) => {
      new CfnPermission(this, `${id}InvokeUrlFromCloudFront`, {
        action: "lambda:InvokeFunctionUrl",
        functionName: functionArn,
        principal: "cloudfront.amazonaws.com",
        sourceArn,
        functionUrlAuthType: "AWS_IAM",
      });
      new CfnPermission(this, `${id}InvokeFromCloudFront`, {
        action: "lambda:InvokeFunction",
        functionName: functionArn,
        principal: "cloudfront.amazonaws.com",
        sourceArn,
        invokedViaFunctionUrl: true,
      });
    };
    allowCloudFront("Shell", param(PARAM.app.shellFunctionArn));
    for (const zone of ZONES)
      allowCloudFront(`Zone${zone.id}`, param(zoneParams(zone).functionArn));

    new BucketDeployment(this, "DeployStatic", {
      sources: [Source.asset(path.join(REPO_ROOT, "apps", "shell", ".next", "static"))],
      destinationBucket: assets,
      destinationKeyPrefix: "_next/static",
      // Old hashed files stay so pages opened before a deployment keep working.
      prune: false,
      // The shell's files carry new hashes on every build, so this runs on every deploy:
      // cached copies of the prerendered public pages must point at the new files.
      distribution,
      distributionPaths: ["/", "/pass/einloesen*"],
      memoryLimit: 256,
      logGroup: new LogGroup(this, "DeployStaticLogs", {
        retention: RetentionDays.THREE_DAYS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    for (const zone of ZONES) {
      new BucketDeployment(this, `DeployStatic-${zone.id}`, {
        sources: [Source.asset(path.join(REPO_ROOT, zone.app, ".next", "static"))],
        destinationBucket: assets,
        destinationKeyPrefix: `${zone.basePath.slice(1)}/_next/static`,
        prune: false,
        memoryLimit: 256,
        logGroup: new LogGroup(this, `DeployStaticLogs-${zone.id}`, {
          retention: RetentionDays.THREE_DAYS,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      });
    }

    new BucketDeployment(this, "DeployWidgets", {
      sources: [Source.asset(path.join(REPO_ROOT, "packages", "widget-notifications", "dist"))],
      destinationBucket: assets,
      destinationKeyPrefix: "widgets",
      // Widget files keep their names, so CloudFront must drop its copies on every deploy.
      distribution,
      distributionPaths: ["/widgets/*"],
      memoryLimit: 256,
      logGroup: new LogGroup(this, "DeployWidgetsLogs", {
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

  /** Paused edge: same distribution, every dynamic path answered by the pause function. */
  private pausedDistribution(
    props: EdgeStackProps,
    assets: Bucket,
    assetsOrigin: ReturnType<typeof S3BucketOrigin.withOriginAccessControl>,
  ): void {
    const pause = new CloudFrontFunction(this, "PauseFunction", {
      comment: "Answers every request with the pause page while the app is torn down",
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromInline(pauseFunctionCode()),
    });
    const answeredByPause = {
      origin: assetsOrigin,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      cachePolicy: CachePolicy.CACHING_DISABLED,
      functionAssociations: [{ function: pause, eventType: FunctionEventType.VIEWER_REQUEST }],
    };
    const staticFiles = {
      origin: assetsOrigin,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
    };
    const distribution = new Distribution(this, "Distribution", {
      comment: "Kundenportal demo",
      priceClass: PriceClass.PRICE_CLASS_100,
      httpVersion: HttpVersion.HTTP2_AND_3,
      domainNames: [props.domainName],
      certificate: props.certificate,
      defaultBehavior: answeredByPause,
      additionalBehaviors: {
        "/_next/static/*": staticFiles,
        "/widgets/*": staticFiles,
        "/api/*": answeredByPause,
      },
    });
    void assets;
    new CfnOutput(this, "PortalUrl", { value: `https://${props.domainName}` });
    new CfnOutput(this, "DistributionDomain", {
      value: distribution.distributionDomainName,
      description: "Target of the CNAME record; unchanged while paused",
    });
  }
}
