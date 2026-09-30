import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { apiScopes, loadApiRoutes, SECURITY_SCHEME } from "./routes.js";

const routes = loadApiRoutes();

describe("OpenAPI contract", () => {
  it("gives every operation a unique operationId", () => {
    const ids = routes.map((route) => route.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires at least one OIDC scope on every operation that is not public", () => {
    expect(routes.filter((route) => !route.public && route.scopes.length === 0)).toEqual([]);
    expect(routes.filter((route) => route.public && route.scopes.length > 0)).toEqual([]);
  });

  it("makes only the challenge and redeeming an invitation public", () => {
    expect(routes.filter((route) => route.public).map((route) => route.operationId)).toEqual([
      "getRedeemChallenge",
      "redeemInvitation",
    ]);
  });

  it("uses scopes of a single resource server in the form <server>/<name>", () => {
    const scopes = apiScopes(routes);
    expect(new Set(scopes.map((scope) => scope.resourceServer))).toEqual(new Set(["kundenportal"]));
    expect(scopes.every((scope) => /^[a-z]+(\.[a-z]+)*$/.test(scope.name))).toBe(true);
  });

  it("maps the routes with their scopes", () => {
    expect(
      routes.map(({ method, path, scopes }) => `${method} ${path} ${scopes.join(",")}`),
    ).toEqual([
      "GET /me kundenportal/profile.read",
      "PATCH /me kundenportal/profile.write",
      "GET /notifications kundenportal/notifications.read",
      "PATCH /notifications/{notificationId} kundenportal/notifications.write",
      "GET /contracts kundenportal/contracts.read",
      "GET /contracts/{contractId} kundenportal/contracts.read",
      "PATCH /contracts/{contractId} kundenportal/contracts.write",
      "GET /contracts/{contractId}/readings kundenportal/readings.read",
      "POST /contracts/{contractId}/readings kundenportal/readings.write",
      "GET /contracts/{contractId}/usage kundenportal/readings.read",
      "GET /documents kundenportal/documents.read",
      "POST /documents/upload-url kundenportal/documents.write",
      "GET /me/links kundenportal/profile.read",
      "POST /me/links kundenportal/profile.write",
      "GET /migration/status kundenportal/migration.read",
      "POST /migration/bulk kundenportal/migration.write",
      "POST /migration/reset kundenportal/migration.write",
      "POST /migration/dlq/{recordId}/redrive kundenportal/migration.write",
      "POST /tenancy/invitations kundenportal/tenancy.admin",
      "GET /tenancy/passes kundenportal/tenancy.admin",
      "POST /tenancy/passes/{passId}/revoke kundenportal/tenancy.admin",
      "GET /tenancy/pass kundenportal/tenancy.read",
      "GET /tenancy/challenge ",
      "POST /tenancy/redeem ",
    ]);
  });

  it("derives one read and one write scope per domain (tenancy: read and admin)", () => {
    expect(apiScopes(routes).map((scope) => scope.name)).toEqual([
      "contracts.read",
      "contracts.write",
      "documents.read",
      "documents.write",
      "migration.read",
      "migration.write",
      "notifications.read",
      "notifications.write",
      "profile.read",
      "profile.write",
      "readings.read",
      "readings.write",
      "tenancy.admin",
      "tenancy.read",
    ]);
  });

  it("answers every operation's errors as problem details", () => {
    const spec = parse(readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8")) as {
      paths: Record<string, Record<string, { responses?: Record<string, { $ref?: string }> }>>;
    };
    for (const item of Object.values(spec.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        if (method === "parameters") continue;
        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          if (Number(status) >= 400) expect(response.$ref).toBe("#/components/responses/Problem");
        }
      }
    }
  });

  it("never takes the tenant from the URL", () => {
    expect(routes.some((route) => route.path.includes("tenant"))).toBe(false);
  });

  it("names the generic OIDC scheme, not a vendor", () => {
    expect(SECURITY_SCHEME).toBe("oidc");
  });
});
