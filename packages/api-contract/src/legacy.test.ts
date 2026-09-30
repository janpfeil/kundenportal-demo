import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Operation {
  operationId?: string;
  security?: unknown[];
  parameters?: { $ref?: string }[];
}
interface Spec {
  openapi: string;
  security: unknown[];
  paths: Record<string, Record<string, Operation>>;
}

const load = (file: string) =>
  parse(readFileSync(new URL(`../legacy/${file}`, import.meta.url), "utf8")) as Spec;

describe.each([
  [
    "versorger.openapi.yaml",
    "#/components/parameters/Mandant",
    "/api/v1/kunden/export",
    "/api/v1/verwaltung/mandant",
  ],
  [
    "telko.openapi.yaml",
    "#/components/parameters/Tenant",
    "/v2/subscribers/export",
    "/v2/admin/tenant",
  ],
])("legacy contract %s", (file, tenantParameter, exportPath, tenantPath) => {
  const spec = load(file);
  const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({ path, method, operation })),
  );

  it("is OpenAPI 3.1 and requires the API key by default", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.security).toEqual([{ apiKey: [] }]);
  });

  it("leaves only the health check open", () => {
    const open = operations.filter(({ operation }) => operation.security?.length === 0);
    expect(open.map(({ path }) => path)).toEqual(["/health"]);
  });

  it("selects the tenant on every protected operation", () => {
    const protectedOps = operations.filter(({ path }) => path !== "/health");
    for (const { operation } of protectedOps) {
      expect(operation.parameters?.map((p) => p.$ref)).toContain(tenantParameter);
    }
  });

  it("offers sign-in check, customer read, a paged export and tenant provisioning", () => {
    expect(operations.map(({ operation }) => operation.operationId).every(Boolean)).toBe(true);
    expect(operations.length).toBe(8);
    expect(Object.keys(spec.paths)).toContain(exportPath);
    expect(Object.keys(spec.paths[tenantPath] ?? {}).sort()).toEqual(["delete", "put"]);
  });
});
