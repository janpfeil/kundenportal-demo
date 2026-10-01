import { describe, expect, it } from "vitest";
import { groupsOf, operatorFrom } from "./operator.js";
import { apiEvent } from "./testing/api-event.js";

const event = (claims: Record<string, string>) => apiEvent("GET /admin/customers", { claims });

describe("operator", () => {
  it("reads the groups from an array claim or the authorizer's string form", () => {
    expect(groupsOf(event({ "cognito:groups": "[owner other]" }))).toEqual(["owner", "other"]);
    expect(groupsOf(event({}))).toEqual([]);
  });

  it("lets the owner and a pass holder in the own pass tenant operate", () => {
    expect(operatorFrom(event({ "cognito:groups": "[owner]" })).tenantId).toBe("owner");
    expect(
      operatorFrom(event({ "cognito:groups": "[pass]", tenant_id: "p4k7x2qa" })).tenantId,
    ).toBe("p4k7x2qa");
  });

  it("refuses customers and a pass holder outside a pass tenant", () => {
    expect(() => operatorFrom(event({}))).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => operatorFrom(event({ "cognito:groups": "[pass]" }))).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });
});
