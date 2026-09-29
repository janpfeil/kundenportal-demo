import { App, Tags } from "aws-cdk-lib";
import { CertificateStack } from "../lib/certificate-stack.js";
import { loadConfig, PROJECT_TAG, REGION } from "../lib/config.js";
import { PortalStack } from "../lib/portal-stack.js";

const app = new App();
const config = loadConfig(app);
const account = process.env.CDK_DEFAULT_ACCOUNT;

const certificate = new CertificateStack(app, "KundenportalCertificate", {
  env: { account, region: "us-east-1" },
  crossRegionReferences: true,
  domainName: config.domainName,
  description: "Kundenportal demo: TLS certificate for CloudFront",
});

new PortalStack(app, "Kundenportal", {
  env: { account, region: REGION },
  crossRegionReferences: true,
  certificate: certificate.certificate,
  config,
  description: "Kundenportal demo: application (identity, API, services, events, edge)",
});

Tags.of(app).add("project", PROJECT_TAG);
