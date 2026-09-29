import { cookies } from "next/headers";
import { clientSecret } from "./client-secret";
import { config } from "./config";
import { LOGIN_COOKIE, SESSION_COOKIE } from "./cookie-names";
import { deriveKey, seal, unseal } from "./crypto";

/**
 * Server-side session (BFF pattern): the access token stays on the server, the browser
 * only holds an encrypted, httpOnly cookie. No refresh token is stored — it would not fit
 * into one cookie; when the access token expires the user signs in again, which the
 * provider's own session usually completes without a password prompt.
 */
export interface Session {
  sub: string;
  name?: string;
  email?: string;
  accessToken: string;
  expiresAt: number;
}

/** Short-lived state between redirect to the provider and callback. */
export interface LoginTransaction {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

const LOGIN_TTL_SECONDS = 600;

async function key(purpose: "session" | "login"): Promise<Uint8Array> {
  return deriveKey(await clientSecret(config()), purpose);
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: config().appUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function readSession(): Promise<Session | undefined> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return undefined;
  const session = await unseal<Session>(value, await key("session"));
  return session && session.expiresAt > Date.now() ? session : undefined;
}

export async function writeSession(session: Session): Promise<void> {
  const value = await seal({ ...session }, await key("session"), new Date(session.expiresAt));
  const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
  (await cookies()).set(SESSION_COOKIE, value, cookieOptions(maxAge));
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function writeLoginTransaction(transaction: LoginTransaction): Promise<void> {
  const expiresAt = new Date(Date.now() + LOGIN_TTL_SECONDS * 1000);
  const value = await seal({ ...transaction }, await key("login"), expiresAt);
  (await cookies()).set(LOGIN_COOKIE, value, cookieOptions(LOGIN_TTL_SECONDS));
}

/** Reads and deletes the login transaction (one-time use). */
export async function takeLoginTransaction(): Promise<LoginTransaction | undefined> {
  const store = await cookies();
  const value = store.get(LOGIN_COOKIE)?.value;
  store.delete(LOGIN_COOKIE);
  return value ? unseal<LoginTransaction>(value, await key("login")) : undefined;
}

/** Accepts only same-site relative paths as post-login target (no open redirects). */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return "/konto";
  return value;
}
