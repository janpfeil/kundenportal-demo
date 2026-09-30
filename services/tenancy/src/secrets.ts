import { createHash, randomBytes, randomInt } from "node:crypto";

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
/** Without look-alikes (0/O, 1/l/I), so the password can be typed from the status page. */
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Invitation token: 32 random bytes, base64url (43 characters). */
export const newInvitationToken = () => randomBytes(32).toString("base64url");

/** Tenant id of a pass: `p` plus seven base32 characters (256 % 32 = 0, so unbiased). */
export function newTenantId(): string {
  return `p${[...randomBytes(7)].map((byte) => BASE32[byte & 31]).join("")}`;
}

/**
 * Demo password of a tenant, e.g. `Demo-k7Pm-x2Qa-R9nw-4`: 12 random characters of a
 * 57-letter alphabet (about 70 bits) and fixed parts that satisfy any usual password
 * policy (upper and lower case, digit, symbol). 21 characters.
 */
export function newDemoPassword(): string {
  const group = () =>
    Array.from({ length: 4 }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join(
      "",
    );
  return `Demo-${group()}-${group()}-${group()}-${randomInt(2, 10)}`;
}
