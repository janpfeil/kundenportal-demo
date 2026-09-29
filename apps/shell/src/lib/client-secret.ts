import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { ShellConfig } from "./config";

let secret: Promise<string> | undefined;

/**
 * The confidential client's secret. Taken from `OIDC_CLIENT_SECRET` if set (any OIDC
 * provider, local development); otherwise read once per Lambda instance from the
 * Cognito user pool, so the secret never appears in templates or environment variables.
 */
export function clientSecret(config: ShellConfig): Promise<string> {
  secret ??= resolve(config).catch((error: unknown) => {
    secret = undefined;
    throw error;
  });
  return secret;
}

async function resolve(config: ShellConfig): Promise<string> {
  if (process.env.OIDC_CLIENT_SECRET) return process.env.OIDC_CLIENT_SECRET;
  if (!config.userPoolId) throw new Error("Set OIDC_CLIENT_SECRET or COGNITO_USER_POOL_ID");
  const result = await new CognitoIdentityProviderClient({}).send(
    new DescribeUserPoolClientCommand({ UserPoolId: config.userPoolId, ClientId: config.clientId }),
  );
  const value = result.UserPoolClient?.ClientSecret;
  if (!value) throw new Error("User pool client has no secret");
  return value;
}
