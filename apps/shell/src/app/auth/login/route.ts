import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { currentLocale } from "@/i18n";
import { config } from "@/lib/config";
import { callbackUrl, client, oidc } from "@/lib/oidc";
import { safeReturnTo, writeLoginTransaction } from "@/lib/session";

/** Starts Authorization Code + PKCE: remembers state, nonce and verifier, then redirects to the provider. */
export async function GET(request: NextRequest) {
  const configuration = await oidc();
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const locale = await currentLocale();
  await writeLoginTransaction({
    state,
    nonce,
    verifier,
    returnTo: safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
  });
  const url = client.buildAuthorizationUrl(configuration, {
    redirect_uri: callbackUrl(),
    scope: config().scope,
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    state,
    nonce,
    // Standard OIDC hint plus Cognito managed login's own language parameter.
    ui_locales: locale,
    lang: locale,
  });
  redirect(url.href);
}
