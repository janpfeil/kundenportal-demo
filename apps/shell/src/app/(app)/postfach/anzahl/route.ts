import { api } from "@/lib/api";
import { readSession } from "@/lib/session";

/**
 * Unread count for the <kp-bell> widget (same origin, session cookie, JSON). Returns 401
 * when signed out, so the widget stays quiet instead of redirecting.
 */
export async function GET() {
  const headers = { "cache-control": "no-store" };
  if (!(await readSession())) return Response.json({ unread: 0 }, { status: 401, headers });
  const { data } = await (await api()).GET("/notifications");
  const unread = (data?.items ?? []).filter((note) => !note.read).length;
  return Response.json({ unread }, { headers });
}
