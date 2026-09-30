import { isSameOrigin } from "@kundenportal/web-auth";
import { config } from "@/lib/config";
import { TOKEN } from "@/lib/redeem";
import { clientIp, publicApi } from "@/lib/tenancy";
import { readJson } from "@/lib/write-guard";

const NO_STORE = { "cache-control": "no-store" };
const MAX_ALTCHA_LENGTH = 20_000;

function problem(status: number, title: string): Response {
  return Response.json(
    { title, status },
    { status, headers: { ...NO_STORE, "content-type": "application/problem+json" } },
  );
}

/**
 * Redeems an invitation (public, no session): the browser posts `{token, altcha}` via
 * sendJson; this handler checks the origin (CSRF) and the shape, adds the visitor's IP for
 * the rate limit and forwards to POST /tenancy/redeem. The API's status and problem
 * details pass through, so the page can explain what went wrong.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request.headers, config().appUrl)) return problem(403, "Forbidden");
  const body = (await readJson(request)) as { token?: unknown; altcha?: unknown } | undefined;
  const token = body?.token;
  const altcha = body?.altcha;
  if (
    typeof token !== "string" ||
    !TOKEN.test(token) ||
    typeof altcha !== "string" ||
    altcha.length === 0 ||
    altcha.length > MAX_ALTCHA_LENGTH
  ) {
    return problem(400, "Bad Request");
  }

  const ip = clientIp(request.headers);
  let response: Response;
  try {
    response = await publicApi("/tenancy/redeem", {
      method: "POST",
      headers: { "content-type": "application/json", ...(ip ? { "x-kp-client-ip": ip } : {}) },
      body: JSON.stringify({ token, altcha }),
    });
  } catch {
    return problem(502, "Bad Gateway");
  }
  const result: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    return Response.json(
      typeof result === "object" && result !== null
        ? result
        : { title: response.statusText || "Error", status: response.status },
      {
        status: response.status,
        headers: { ...NO_STORE, "content-type": "application/problem+json" },
      },
    );
  }
  return Response.json(result ?? {}, { status: response.status, headers: NO_STORE });
}
