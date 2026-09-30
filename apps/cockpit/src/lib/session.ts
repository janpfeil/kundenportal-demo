import { type Session, loginUrl, readSession } from "@kundenportal/web-auth";
import { redirect } from "next/navigation";
import { cache } from "react";

/** The session of the current request, read once per render (layout and page share it). */
export const currentSession = cache(readSession);

/**
 * The session or a redirect to the shell's sign-in, which returns to `path` afterwards.
 * `path` is the full path including the zone's basePath.
 */
export async function requireSession(path: string): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect(loginUrl(path));
  return session;
}
