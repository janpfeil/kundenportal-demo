import path from "node:path";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Architecture, type FunctionProps, Runtime } from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunction,
  type NodejsFunctionProps,
  OutputFormat,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

export const REPO_ROOT = path.join(import.meta.dirname, "..", "..", "..");

/** Settings every function of the portal shares (guard rails from the task). */
export function baseFunctionProps(
  scope: Construct,
  id: string,
  reservedConcurrency: number,
): Pick<FunctionProps, "runtime" | "architecture" | "logGroup" | "reservedConcurrentExecutions"> {
  return {
    runtime: Runtime.NODEJS_24_X,
    architecture: Architecture.ARM_64,
    logGroup: new LogGroup(scope, `${id}Logs`, {
      retention: RetentionDays.THREE_DAYS,
      removalPolicy: RemovalPolicy.DESTROY,
    }),
    ...(reservedConcurrency > 0 ? { reservedConcurrentExecutions: reservedConcurrency } : {}),
  };
}

/** A service function bundled from TypeScript with esbuild (ESM, minified, AWS SDK from the runtime). */
export class ServiceFunction extends NodejsFunction {
  constructor(
    scope: Construct,
    id: string,
    props: { entry: string; handler?: string; reservedConcurrency: number } & Pick<
      NodejsFunctionProps,
      "environment" | "timeout" | "description"
    >,
  ) {
    super(scope, id, {
      ...baseFunctionProps(scope, id, props.reservedConcurrency),
      entry: path.join(REPO_ROOT, props.entry),
      handler: props.handler ?? "handler",
      projectRoot: REPO_ROOT,
      depsLockFilePath: path.join(REPO_ROOT, "pnpm-lock.yaml"),
      memorySize: 256,
      timeout: props.timeout ?? Duration.seconds(10),
      ...(props.description ? { description: props.description } : {}),
      environment: { NODE_OPTIONS: "--enable-source-maps", ...props.environment },
      bundling: {
        format: OutputFormat.ESM,
        target: "node24",
        minify: true,
        sourceMap: true,
        mainFields: ["module", "main"],
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    });
  }
}
