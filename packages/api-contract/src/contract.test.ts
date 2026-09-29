import { describe, expect, it } from "vitest";
import { apiScopes, loadApiRoutes, SECURITY_SCHEME } from "./routes.js";

const routes = loadApiRoutes();

describe("OpenAPI contract", () => {
  it("gives every operation a unique operationId", () => {
    const ids = routes.map((route) => route.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires at least one OIDC scope on every operation", () => {
    expect(routes.filter((route) => route.scopes.length === 0)).toEqual([]);
  });

  it("uses scopes of a single resource server in the form <server>/<name>", () => {
    const scopes = apiScopes(routes);
    expect(new Set(scopes.map((scope) => scope.resourceServer))).toEqual(new Set(["kundenportal"]));
    expect(scopes.every((scope) => /^[a-z]+(\.[a-z]+)*$/.test(scope.name))).toBe(true);
  });

  it("maps the phase 1 routes with their scopes", () => {
    expect(
      routes.map(({ method, path, scopes }) => `${method} ${path} ${scopes.join(",")}`),
    ).toEqual([
      "GET /me kundenportal/profile.read",
      "PATCH /me kundenportal/profile.write",
      "GET /notifications kundenportal/notifications.read",
      "PATCH /notifications/{notificationId} kundenportal/notifications.write",
    ]);
  });

  it("never takes the tenant from the URL", () => {
    expect(routes.some((route) => route.path.includes("tenant"))).toBe(false);
  });

  it("names the generic OIDC scheme, not a vendor", () => {
    expect(SECURITY_SCHEME).toBe("oidc");
  });
});
