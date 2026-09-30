import { publicApi } from "@/lib/tenancy";

const NO_STORE = { "cache-control": "no-store" };

/**
 * ALTCHA challenge for the redeem page, fetched by the widget in the browser. Proxies the
 * public GET /tenancy/challenge, so the browser only talks to the portal's own origin. Every
 * challenge is signed and expires; it must never be cached.
 */
export async function GET() {
  try {
    const response = await publicApi("/tenancy/challenge");
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok || typeof body !== "object" || body === null) {
      return Response.json(
        { title: "Service Unavailable", status: 503 },
        { status: 503, headers: { ...NO_STORE, "content-type": "application/problem+json" } },
      );
    }
    return Response.json(body, { headers: NO_STORE });
  } catch {
    return Response.json(
      { title: "Bad Gateway", status: 502 },
      { status: 502, headers: { ...NO_STORE, "content-type": "application/problem+json" } },
    );
  }
}
