import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import type { z } from "zod";
import { badRequest, HttpError } from "./errors.js";
import { log } from "./log.js";

export type ApiEvent = APIGatewayProxyEventV2WithJWTAuthorizer;
export type ApiResult = APIGatewayProxyStructuredResultV2;
export type ApiHandler = (event: ApiEvent) => Promise<ApiResult>;

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(status: number, body: unknown): ApiResult {
  return {
    statusCode: status,
    headers: { "content-type": "application/json", ...SECURITY_HEADERS },
    body: JSON.stringify(body),
  };
}

export function noContent(): ApiResult {
  return { statusCode: 204, headers: SECURITY_HEADERS };
}

export function problem(status: number, title: string, detail?: string): ApiResult {
  return {
    statusCode: status,
    headers: { "content-type": "application/problem+json", ...SECURITY_HEADERS },
    body: JSON.stringify(detail ? { title, status, detail } : { title, status }),
  };
}

/** Parses and validates a JSON request body; invalid input becomes a 400 problem. */
export function parseBody<T extends z.ZodType>(event: ApiEvent, schema: T): z.infer<T> {
  let raw: unknown;
  try {
    const text = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "");
    raw = JSON.parse(text);
  } catch {
    throw badRequest("Request body is not valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join("; "));
  }
  return result.data;
}

/**
 * Dispatches by the API gateway route key (e.g. `GET /me`) and turns thrown
 * `HttpError`s into problem responses. Unexpected errors are logged and hidden.
 */
export function router(routes: Record<string, ApiHandler>): ApiHandler {
  return async (event) => {
    const handler = routes[event.routeKey];
    if (!handler) return problem(404, "Not Found", `No route for ${event.routeKey}`);
    try {
      return await handler(event);
    } catch (error) {
      if (error instanceof HttpError) return problem(error.status, error.title, error.detail);
      log("error", "Unhandled error", {
        routeKey: event.routeKey,
        requestId: event.requestContext.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return problem(500, "Internal Server Error");
    }
  };
}
