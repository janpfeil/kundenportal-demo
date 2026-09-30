import { cookies } from "next/headers.js";
import { clientSecret } from "./client-secret.js";
import { zoneConfig } from "./config.js";
import { deriveKey, unseal } from "./crypto.js";

/** Name of the session cookie the shell writes after sign-in. */
export const SESSION_COOKIE = "kp_session";

/**
 * The signed-in user's session as the shell stores it: an encrypted, httpOnly cookie
 * (JWE) that holds the access token. Zones only read it; sign-in and sign-out stay in the
 * shell, so all zones share one session on the same domain.
 */
export interface Session {
  sub: string;
  name?: string;
  email?: string;
  accessToken: string;
  expiresAt: number;
}

export async function readSession(): Promise<Session | undefined> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return undefined;
  const config = zoneConfig();
  const session = await unseal<Session>(value, deriveKey(await clientSecret(config), "session"));
  return session && session.expiresAt > Date.now() ? session : undefined;
}

/**
 * Absolute URL where the shell starts sign-in and returns the visitor to `returnTo`
 * afterwards. Absolute on purpose: inside a zone, Next.js prefixes relative redirect
 * targets with the zone's basePath.
 */
export function loginUrl(returnTo: string, appUrl: URL = zoneConfig().appUrl): string {
  const url = new URL("/auth/login", appUrl);
  url.searchParams.set("returnTo", returnTo);
  return url.href;
}
