import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Operation {
  operationId?: string;
  security?: unknown[];
}

const spec = parse(readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8")) as {
  security?: unknown[];
  paths: Record<string, Record<string, Operation>>;
};
const operations = Object.values(spec.paths).flatMap((item) => Object.values(item));

describe("OpenAPI contract", () => {
  it("gives every operation a unique operationId", () => {
    const ids = operations.map((op) => op.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("protects every operation with the Auth0 bearer token", () => {
    expect(spec.security).toEqual([{ auth0: [] }]);
    expect(operations.filter((op) => op.security && op.security.length === 0)).toEqual([]);
  });

  it("never takes the tenant from the URL", () => {
    expect(Object.keys(spec.paths).some((path) => path.includes("tenant"))).toBe(false);
  });
});
