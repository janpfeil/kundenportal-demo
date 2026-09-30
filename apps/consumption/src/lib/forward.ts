import { apiFor, isSameOrigin, readSession, zoneConfig } from "@kundenportal/web-auth";

type Api = ReturnType<typeof apiFor>;

/** What an openapi-fetch call resolves to. */
export interface ApiResult {
  data?: unknown;
  error?: unknown;
  response: Response;
}

const NO_STORE = { "cache-control": "no-store" };

/** An RFC 9457 problem response of the zone itself. */
export function problem(status: number, title: string, detail?: string): Response {
  return Response.json(
    { title, status, ...(detail !== undefined ? { detail } : {}) },
    { status, headers: { ...NO_STORE, "content-type": "application/problem+json" } },
  );
}

/**
 * Write path of a zone (BFF): the browser posts JSON to a route handler of the zone, which
 * checks the origin (CSRF) and the session, validates the body and calls the portal API
 * with the session's access token. The API's status and problem details pass through
 * unchanged, so the browser can show what went wrong.
 */
export async function forwardWrite<T>(
  request: Request,
  parse: (body: unknown) => T | undefined,
  call: (api: Api, body: T) => Promise<ApiResult>,
): Promise<Response> {
  if (!isSameOrigin(request.headers, zoneConfig().appUrl))
    return problem(403, "Forbidden", "The request does not come from the portal");
  const session = await readSession();
  if (!session) return problem(401, "Unauthorized", "Please sign in again");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return problem(400, "Bad Request", "The body is not valid JSON");
  }
  const body = parse(raw);
  if (body === undefined) return problem(400, "Bad Request", "The request is not valid");

  let result: ApiResult;
  try {
    result = await call(apiFor(session), body);
  } catch {
    return problem(502, "Bad Gateway", "The portal API could not be reached");
  }
  const { status, ok, statusText } = result.response;
  if (!ok) {
    const error =
      typeof result.error === "object" && result.error !== null
        ? result.error
        : { title: statusText || "Error", status };
    return Response.json(error, {
      status,
      headers: { ...NO_STORE, "content-type": "application/problem+json" },
    });
  }
  return Response.json(result.data ?? null, { status, headers: NO_STORE });
}
