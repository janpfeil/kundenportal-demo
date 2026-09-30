import { App, Tags } from "aws-cdk-lib";
import { AppStack } from "../lib/app-stack.js";
import { BaseStack } from "../lib/base-stack.js";
import { CertificateStack } from "../lib/certificate-stack.js";
import { loadConfig, PROJECT_TAG, REGION } from "../lib/config.js";
import { EdgeStack } from "../lib/edge-stack.js";

/**
 * Four stacks, deployed in this order by scripts/deploy.sh:
 *   KundenportalCertificate (us-east-1, long-lived)  TLS certificate for CloudFront
 *   KundenportalBase        (long-lived)             Cognito, DynamoDB, owner topic
 *   KundenportalApp         (removed by teardown)    services, shell, API, events
 *   KundenportalEdge        (long-lived)             CloudFront + static files, re-pointed at the app
 * Base, App and Edge are coupled through SSM parameters (lib/parameters.ts), not exports.
 */
const app = new App();
const config = loadConfig(app);
const account = process.env.CDK_DEFAULT_ACCOUNT;
const env = { account, region: REGION };

const certificate = new CertificateStack(app, "KundenportalCertificate", {
  env: { account, region: "us-east-1" },
  crossRegionReferences: true,
  domainName: config.domainName,
  description: "Kundenportal demo: TLS certificate for CloudFront",
});

new BaseStack(app, "KundenportalBase", {
  env,
  config,
  description: "Kundenportal demo: identity, data and owner topic (long-lived)",
});

new AppStack(app, "KundenportalApp", {
  env,
  config,
  description: "Kundenportal demo: services, shell, API and events (removed by teardown)",
});

new EdgeStack(app, "KundenportalEdge", {
  env,
  crossRegionReferences: true,
  domainName: config.domainName,
  certificate: certificate.certificate,
  paused: config.edgePaused,
  description: "Kundenportal demo: CloudFront distribution and static files (long-lived)",
});

Tags.of(app).add("project", PROJECT_TAG);
