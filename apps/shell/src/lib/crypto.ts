import { hkdfSync } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

/**
 * Derives the cookie encryption key from the client secret (HKDF-SHA256). Rotating the
 * client secret therefore invalidates all sessions, and no second secret is needed.
 */
export function deriveKey(secret: string, purpose: string): Uint8Array {
  return new Uint8Array(hkdfSync("sha256", secret, "kundenportal-shell", purpose, 32));
}

/** Encrypts a payload as a compact JWE (dir + A256GCM) that expires at `expiresAt`. */
export async function seal(
  payload: Record<string, unknown>,
  key: Uint8Array,
  expiresAt: Date,
): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .encrypt(key);
}

/** Decrypts a value from `seal`; returns `undefined` for tampered, foreign or expired values. */
export async function unseal<T>(value: string, key: Uint8Array): Promise<T | undefined> {
  try {
    const { payload } = await jwtDecrypt(value, key, { keyManagementAlgorithms: ["dir"] });
    return payload as T;
  } catch {
    return undefined;
  }
}
