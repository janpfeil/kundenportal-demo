/** What the redeem page shows after a failed attempt; one text per case. */
export type RedeemError =
  "invalid" | "unknown" | "used" | "expired" | "rateLimited" | "closed" | "failed";

/** Maps the status of POST /pass/einloesen/api (the API's, passed through) to a text key. */
export function redeemError(status: number): RedeemError {
  switch (status) {
    case 400:
      return "invalid";
    case 404:
      return "unknown";
    case 409:
      return "used";
    case 410:
      return "expired";
    case 429:
      return "rateLimited";
    case 503:
      return "closed";
    default:
      return "failed";
  }
}

/** Invitation tokens are 256-bit random values, URL-safe encoded (base64url or hex). */
export const TOKEN = /^[A-Za-z0-9_-]{16,200}$/;

/**
 * The invitation token from the URL fragment (`#<token>`). The fragment never reaches the
 * server with the page request; the token leaves the browser only in the redeem POST body.
 */
export function tokenFromHash(hash: string): string | undefined {
  let value = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    value = decodeURIComponent(value).trim();
  } catch {
    return undefined;
  }
  return TOKEN.test(value) ? value : undefined;
}
