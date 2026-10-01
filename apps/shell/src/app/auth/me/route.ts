import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Name and address of the signed-in user for the user menu of prerendered pages, which
 * are the same for every visitor and therefore cannot carry them. Never cached.
 */
export async function GET() {
  const session = await readSession();
  const headers = { "cache-control": "private, no-store" };
  if (!session) return Response.json({ signedIn: false }, { status: 401, headers });
  return Response.json(
    { signedIn: true, name: session.name ?? null, email: session.email ?? null },
    { headers },
  );
}
