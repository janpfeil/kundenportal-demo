import { rolesOf } from "@kundenportal/web-auth";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { client, oidc } from "@/lib/oidc";
import { takeLoginTransaction, writeSession } from "@/lib/session";

/** Completes the sign-in: exchanges the code (with PKCE verifier), checks state and nonce, opens the session. */
export async function GET(request: NextRequest) {
  const transaction = await takeLoginTransaction();
  if (!transaction) redirect("/auth/login");

  // The Lambda sees its own function URL as host; the provider redirected to the public URL.
  const currentUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, config().appUrl);
  let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
  try {
    tokens = await client.authorizationCodeGrant(await oidc(), currentUrl, {
      pkceCodeVerifier: transaction.verifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    });
  } catch (error) {
    console.error(
      JSON.stringify({ level: "warn", message: "Sign-in failed", error: String(error) }),
    );
    redirect("/?login=failed");
  }

  const claims = tokens.claims();
  if (!claims) redirect("/?login=failed");
  const session: Parameters<typeof writeSession>[0] = {
    sub: claims.sub,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expiresIn() ?? 300) * 1000,
  };
  if (typeof claims.name === "string") session.name = claims.name;
  if (typeof claims.email === "string") session.email = claims.email;
  // The navigation of prerendered pages shows pass status and cockpit from this hint.
  const roles = rolesOf(tokens.access_token);
  await writeSession(session, roles.pass ? "pass" : roles.cockpit ? "owner" : "user");
  redirect(transaction.returnTo);
}
