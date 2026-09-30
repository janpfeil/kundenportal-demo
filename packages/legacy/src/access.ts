import { GetParametersCommand, type SSMClient } from "@aws-sdk/client-ssm";
import { KeycloakPasswordCheck } from "./keycloak.js";
import { TelcoClient } from "./telco.js";
import { UtilityClient } from "./utility.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Access to the legacy systems, built from SSM parameters (API keys as SecureString). */
export interface LegacyAccess {
  utility: UtilityClient;
  telco: TelcoClient;
  keycloak: KeycloakPasswordCheck;
}

/** Names of the SSM parameters, passed in as environment variables by the CDK stack. */
export const LEGACY_PARAMETER_ENV = {
  utilityUrl: "LEGACY_UTILITY_URL_PARAM",
  utilityKey: "LEGACY_UTILITY_API_KEY_PARAM",
  telcoUrl: "LEGACY_TELCO_URL_PARAM",
  telcoKey: "LEGACY_TELCO_API_KEY_PARAM",
  keycloakIssuer: "LEGACY_KEYCLOAK_ISSUER_PARAM",
  keycloakClientId: "LEGACY_KEYCLOAK_CLIENT_ID_PARAM",
  keycloakSecret: "LEGACY_KEYCLOAK_CLIENT_SECRET_PARAM",
} as const;

/**
 * Loads the parameters (call once per execution environment). Cognito gives a trigger
 * 5 seconds in total, so the legacy calls get a tight deadline each by default.
 */
export async function loadLegacyAccess(ssm: SSMClient, timeoutMs = 1500): Promise<LegacyAccess> {
  const names = Object.fromEntries(
    Object.entries(LEGACY_PARAMETER_ENV).map(([key, env]) => [key, requireEnv(env)]),
  ) as Record<keyof typeof LEGACY_PARAMETER_ENV, string>;
  const result = await ssm.send(
    new GetParametersCommand({ Names: Object.values(names), WithDecryption: true }),
  );
  const values = new Map(result.Parameters?.map((p) => [p.Name, p.Value]));
  const value = (key: keyof typeof LEGACY_PARAMETER_ENV) => {
    const found = values.get(names[key]);
    if (!found) throw new Error(`SSM parameter ${names[key]} is missing`);
    return found;
  };
  return {
    utility: new UtilityClient({
      baseUrl: value("utilityUrl"),
      apiKey: value("utilityKey"),
      timeoutMs,
    }),
    telco: new TelcoClient({ baseUrl: value("telcoUrl"), apiKey: value("telcoKey"), timeoutMs }),
    keycloak: new KeycloakPasswordCheck({
      issuer: value("keycloakIssuer"),
      clientId: value("keycloakClientId"),
      clientSecret: value("keycloakSecret"),
      timeoutMs,
    }),
  };
}
