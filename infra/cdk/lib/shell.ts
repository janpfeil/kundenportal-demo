import type { Construct } from "constructs";
import { NextLambda } from "./next-lambda.js";

export interface ShellProps {
  domainName: string;
  reservedConcurrency: number;
  environment: Record<string, string>;
  userPoolArn: string;
}

/** Shell zone: start page, sign-in and sign-out (OIDC, BFF), account and mailbox. */
export class Shell extends NextLambda {
  constructor(scope: Construct, id: string, props: ShellProps) {
    super(scope, id, {
      ...props,
      app: "apps/shell",
      description: "Shell zone (Next.js standalone server)",
      readinessPath: "/healthz",
    });
  }
}
