import { z } from "zod";
import { callJson, type Fetch, LegacyUnavailableError } from "./http.js";

export interface KeycloakOptions {
  /** e.g. `https://id.rypox.net/realms/telko` */
  issuer: string;
  clientId: string;
  clientSecret: string;
  fetch?: Fetch;
  timeoutMs?: number;
}

const TokenResponse = z.object({ access_token: z.string() });

/** Claims of the telco realm's access token the portal needs. */
const TelcoClaims = z.object({
  sub: z.string(),
  email: z.string().optional(),
  /** Protocol mapper of the realm: user attribute `subscriberId`. */
  subscriber_id: z.string().optional(),
});
export type TelcoClaims = z.infer<typeof TelcoClaims>;

/**
 * Checks a telco customer's password against the telco's Keycloak realm with the
 * resource owner password grant of a confidential client. This grant is meant for
 * exactly this case: a trusted server that receives the password anyway (the Cognito
 * migration trigger) and has no browser to redirect.
 */
export class KeycloakPasswordCheck {
  private readonly fetchImpl: Fetch;

  constructor(private readonly options: KeycloakOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async verify(username: string, password: string): Promise<TelcoClaims | undefined> {
    const form = new URLSearchParams({
      grant_type: "password",
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      username,
      password,
      scope: "openid",
    });
    const { status, body } = await callJson(
      this.fetchImpl,
      `${this.options.issuer}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        timeoutMs: this.options.timeoutMs ?? 3000,
      },
    );
    // Wrong credentials (or a disabled user) are `invalid_grant`; any other error means
    // the client is misconfigured and must not look like a wrong password.
    const error = z.object({ error: z.string() }).safeParse(body);
    if ((status === 400 || status === 401) && error.data?.error === "invalid_grant")
      return undefined;
    const token = TokenResponse.safeParse(body);
    if (status !== 200 || !token.success) throw new LegacyUnavailableError(`token: HTTP ${status}`);
    // The token comes straight from the issuer over TLS, so its payload is trusted as is.
    const payload = token.data.access_token.split(".")[1] ?? "";
    const claims = TelcoClaims.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    if (!claims.success) throw new LegacyUnavailableError("token without subject");
    return claims.data;
  }
}
