import type { App } from "aws-cdk-lib";

/** Deployment settings, taken from CDK context (`cdk.json` or `-c key=value`). */
export interface PortalConfig {
  /** Public host name of the portal; the certificate and Cognito callbacks use it. */
  domainName: string;
  /** Prefix of the Cognito managed login domain (`<prefix>.auth.<region>.amazoncognito.com`). */
  cognitoDomainPrefix: string;
  /** Reserved concurrency per service function; 0 disables it (e.g. while the account limit is 10). */
  reservedConcurrency: number;
  /**
   * Reserved concurrency of the Next.js functions (shell, zones). Page loads come in short
   * bursts (document, prefetches, API routes), so they need more than a service; 0 when
   * reservations are disabled.
   */
  webReservedConcurrency: number;
  /** SSM parameter (written by Terraform) that holds the owner's e-mail address. */
  ownerEmailParameter: string;
  /** Allows sign-in callbacks to http://localhost:3000 for local development of the shell. */
  allowLocalhostCallback: boolean;
}

export const PROJECT_TAG = "kundenportal-demo";
export const REGION = "eu-central-1";

export function loadConfig(app: App): PortalConfig {
  const context = (key: string) =>
    app.node.tryGetContext(key) as string | number | boolean | undefined;
  const reserved = Number(context("reservedConcurrency") ?? 2);
  if (!Number.isInteger(reserved) || reserved < 0)
    throw new Error("reservedConcurrency must be an integer >= 0");
  return {
    domainName: String(context("domainName") ?? "kundenportal-demo.rypox.com"),
    cognitoDomainPrefix: String(context("cognitoDomainPrefix") ?? "kundenportal-demo"),
    reservedConcurrency: reserved,
    webReservedConcurrency: reserved > 0 ? Number(context("webReservedConcurrency") ?? 5) : 0,
    ownerEmailParameter: String(context("ownerEmailParameter") ?? "/kundenportal/owner-email"),
    allowLocalhostCallback: String(context("allowLocalhostCallback") ?? "true") === "true",
  };
}
