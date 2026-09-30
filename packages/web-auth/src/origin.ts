/**
 * CSRF guard for state-changing requests (POST, PATCH, PUT, DELETE) to a zone: the
 * session cookie is SameSite=Lax, so browsers do not send it with cross-site requests;
 * in addition the request must come from the portal's own origin.
 */
export function isSameOrigin(headers: Headers, appUrl: URL): boolean {
  const origin = headers.get("origin");
  if (origin) return origin === appUrl.origin;
  // Fetch always sends Origin for non-GET requests; its absence means no browser fetch.
  return false;
}
