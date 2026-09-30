import { Stack } from "aws-cdk-lib";
import { type IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { Function as LambdaFunction } from "aws-cdk-lib/aws-lambda";
import { PARAM } from "./parameters.js";

/**
 * Environment variables `loadLegacyAccess` (packages/legacy) reads: the names of the SSM
 * parameters, never their values.
 */
export const LEGACY_ENVIRONMENT = {
  LEGACY_UTILITY_URL_PARAM: PARAM.legacy.utilityUrl,
  LEGACY_UTILITY_API_KEY_PARAM: PARAM.legacy.utilityApiKey,
  LEGACY_TELCO_URL_PARAM: PARAM.legacy.telcoUrl,
  LEGACY_TELCO_API_KEY_PARAM: PARAM.legacy.telcoApiKey,
  LEGACY_KEYCLOAK_ISSUER_PARAM: PARAM.legacy.keycloakIssuer,
  LEGACY_KEYCLOAK_CLIENT_ID_PARAM: PARAM.legacy.keycloakClientId,
  LEGACY_KEYCLOAK_CLIENT_SECRET_PARAM: PARAM.legacy.keycloakClientSecret,
} as const;

/**
 * Lets a function read the legacy parameters at run time. SecureStrings use the AWS
 * managed key `aws/ssm` (free); decrypting through SSM needs `kms:Decrypt`, limited to
 * calls via SSM. No Secrets Manager: it costs per secret and month.
 */
export function grantLegacyAccess(fn: LambdaFunction & IGrantable): void {
  const stack = Stack.of(fn);
  for (const [name, value] of Object.entries(LEGACY_ENVIRONMENT)) fn.addEnvironment(name, value);
  fn.addToRolePolicy(
    new PolicyStatement({
      actions: ["ssm:GetParameters"],
      resources: [
        stack.formatArn({
          service: "ssm",
          resource: "parameter",
          resourceName: "kundenportal/legacy/*",
        }),
      ],
    }),
  );
  fn.addToRolePolicy(
    new PolicyStatement({
      actions: ["kms:Decrypt"],
      resources: ["*"],
      conditions: { StringEquals: { "kms:ViaService": `ssm.${stack.region}.amazonaws.com` } },
    }),
  );
}
