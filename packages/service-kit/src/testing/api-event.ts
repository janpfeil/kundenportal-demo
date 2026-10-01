import type { ApiEvent } from "../http.js";

/** Builds an HTTP API event as the gateway delivers it after JWT verification (tests only). */
export function apiEvent(
  routeKey: string,
  options: {
    claims?: Record<string, string>;
    body?: unknown;
    pathParameters?: Record<string, string>;
    /** Decoded query parameters, as the gateway passes them. */
    query?: Record<string, string>;
  } = {},
): ApiEvent {
  const [method = "GET", rawPath = "/"] = routeKey.split(" ");
  return {
    version: "2.0",
    routeKey,
    rawPath,
    rawQueryString: options.query ? new URLSearchParams(options.query).toString() : "",
    headers: {},
    isBase64Encoded: false,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.pathParameters ? { pathParameters: options.pathParameters } : {}),
    ...(options.query ? { queryStringParameters: options.query } : {}),
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.org",
      domainPrefix: "example",
      http: {
        method,
        path: rawPath,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "vitest",
      },
      requestId: "req-1",
      routeKey,
      stage: "$default",
      time: "29/Sep/2026:12:00:00 +0000",
      timeEpoch: 0,
      authorizer: {
        principalId: "",
        integrationLatency: 0,
        jwt: {
          claims: { sub: "sub-1", tenant_id: "owner", ...options.claims },
          scopes: [],
        },
      },
    },
  };
}
