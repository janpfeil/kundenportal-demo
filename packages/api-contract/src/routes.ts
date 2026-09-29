import { readFileSync } from "node:fs";
import { parse } from "yaml";

/** One API route as the gateway needs it: method, path below `/api`, required scopes. */
export interface ApiRoute {
  operationId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  scopes: string[];
}

interface Operation {
  operationId: string;
  security?: Record<string, string[]>[];
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Name of the security scheme every operation must use. */
export const SECURITY_SCHEME = "oidc";

/**
 * Reads the routes and their scopes from `openapi.yaml`, so the gateway configuration
 * (CDK) and the identity provider's resource server are derived from the contract
 * instead of being maintained twice.
 */
export function loadApiRoutes(
  specUrl: URL = new URL("../openapi.yaml", import.meta.url),
): ApiRoute[] {
  const spec = parse(readFileSync(specUrl, "utf8")) as {
    paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
  };
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    METHODS.filter((method) => item[method]).map((method) => {
      const operation = item[method] as Operation;
      const requirement = operation.security?.find((entry) => SECURITY_SCHEME in entry);
      return {
        operationId: operation.operationId,
        method: method.toUpperCase() as ApiRoute["method"],
        path,
        scopes: requirement?.[SECURITY_SCHEME] ?? [],
      };
    }),
  );
}

/** All scopes used by the contract, split into resource server identifier and scope name. */
export function apiScopes(routes: ApiRoute[] = loadApiRoutes()) {
  const unique = [...new Set(routes.flatMap((route) => route.scopes))].sort();
  return unique.map((scope) => {
    const [resourceServer = "", name = ""] = scope.split("/");
    return { scope, resourceServer, name };
  });
}
