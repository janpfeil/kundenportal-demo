import { existsSync } from "node:fs";
import path from "node:path";
import { Duration, Stack } from "aws-cdk-lib";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  Code,
  Function as LambdaFunction,
  type FunctionUrl,
  FunctionUrlAuthType,
  InvokeMode,
  LayerVersion,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { baseFunctionProps, REPO_ROOT } from "./functions.js";

/** Lambda Web Adapter layer published by AWS (https://github.com/awslabs/aws-lambda-web-adapter). */
export const WEB_ADAPTER_LAYER_VERSION = 30;
const WEB_ADAPTER_ACCOUNT = "753240598075";

export interface NextLambdaProps {
  /** App directory relative to the repository root, e.g. apps/shell. */
  app: string;
  description: string;
  domainName: string;
  reservedConcurrency: number;
  /** Environment of the app (API URL, OIDC settings, …). */
  environment: Record<string, string>;
  /** ARN of the user pool whose client secret the app may read (session key). */
  userPoolArn: string;
  /** Path the Lambda Web Adapter polls before routing traffic. */
  readinessPath: string;
}

/**
 * A Next.js standalone server in Lambda via the Lambda Web Adapter, reachable only through
 * a function URL that CloudFront signs with origin access control. Used by the shell and
 * every zone; the zip comes from scripts/package-next-lambda.mjs.
 */
export class NextLambda extends Construct {
  readonly function: LambdaFunction;
  readonly url: FunctionUrl;

  constructor(scope: Construct, id: string, props: NextLambdaProps) {
    super(scope, id);
    const appName = path.basename(props.app);
    const zip = path.join(REPO_ROOT, props.app, ".next", `${appName}-lambda.zip`);
    if (!existsSync(zip)) throw new Error(`Build missing at ${zip}; run "pnpm build" first`);
    const region = Stack.of(this).region;

    this.function = new LambdaFunction(this, "Function", {
      ...baseFunctionProps(this, "Function", props.reservedConcurrency),
      description: props.description,
      code: Code.fromAsset(zip),
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
        AWS_LWA_READINESS_CHECK_PATH: props.readinessPath,
        PORT: "3000",
        NODE_ENV: "production",
        APP_URL: `https://${props.domainName}`,
        ...props.environment,
      },
    });
    this.function.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["cognito-idp:DescribeUserPoolClient"],
        resources: [props.userPoolArn],
      }),
    );
    this.url = this.function.addFunctionUrl({
      authType: FunctionUrlAuthType.AWS_IAM,
      invokeMode: InvokeMode.RESPONSE_STREAM,
    });
  }
}
