import { isSameOrigin } from "@kundenportal/web-auth";
import { config } from "./config";
import { readSession, type Session } from "./session";

/**
 * Guard for state-changing requests to the shell: only from the portal's own origin (CSRF,
 * in addition to the SameSite=Lax session cookie) and only with a session. Returns the
 * session, or the response to send instead.
 */
export async function guardWrite(request: Request): Promise<Session | Response> {
  if (!isSameOrigin(request.headers, config().appUrl)) {
    return Response.json({ title: "Forbidden", status: 403 }, { status: 403 });
  }
  const session = await readSession();
  if (!session) return Response.json({ title: "Unauthorized", status: 401 }, { status: 401 });
  return session;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
