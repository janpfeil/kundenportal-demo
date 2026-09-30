import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { ZoneConfig } from "./config.js";

let secret: Promise<string> | undefined;

/**
 * The confidential client's secret: from `OIDC_CLIENT_SECRET` if set (local development,
 * any OIDC provider), otherwise read once per Lambda instance from the Cognito user pool,
 * so it never appears in templates or environment variables.
 */
export function clientSecret(config: ZoneConfig): Promise<string> {
  secret ??= resolve(config).catch((error: unknown) => {
    secret = undefined;
    throw error;
  });
  return secret;
}

async function resolve(config: ZoneConfig): Promise<string> {
  if (process.env.OIDC_CLIENT_SECRET) return process.env.OIDC_CLIENT_SECRET;
  if (!config.userPoolId) throw new Error("Set OIDC_CLIENT_SECRET or COGNITO_USER_POOL_ID");
  const result = await new CognitoIdentityProviderClient({}).send(
    new DescribeUserPoolClientCommand({ UserPoolId: config.userPoolId, ClientId: config.clientId }),
  );
  const value = result.UserPoolClient?.ClientSecret;
  if (!value) throw new Error("User pool client has no secret");
  return value;
}
