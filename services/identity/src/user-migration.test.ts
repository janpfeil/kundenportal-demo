import type { UserMigrationTriggerEvent } from "aws-lambda";
import { fixedTenantStatus } from "@kundenportal/service-kit/testing";
import { describe, expect, it } from "vitest";
import { fakeLegacy, PASSWORD } from "./testing.js";
import { createHandler, signInTarget } from "./user-migration.js";

function trigger(
  userName: string,
  password: string,
  triggerSource: UserMigrationTriggerEvent["triggerSource"] = "UserMigration_Authentication",
): UserMigrationTriggerEvent {
  return {
    version: "1",
    triggerSource,
    region: "eu-central-1",
    userPoolId: "pool",
    userName,
    callerContext: { awsSdkVersion: "3", clientId: "client" },
    request: { password },
    response: { userAttributes: {} },
  } as unknown as UserMigrationTriggerEvent;
}

describe("migrate user trigger", () => {
  const handler = createHandler(async () => fakeLegacy());

  it("takes Anna over with her utility password", async () => {
    const result = await handler(trigger("Anna.Becker@example.org", PASSWORD));
    expect(result.response).toEqual({
      userAttributes: {
        email: "anna.becker@example.org",
        email_verified: "true",
        name: "Anna Becker",
        locale: "de",
        "custom:legacy_ref": "utility:V-1000123",
        "custom:migration_mode": "lazy",
      },
      finalUserStatus: "CONFIRMED",
      messageAction: "SUPPRESS",
    });
  });

  it("checks telco customers against Keycloak", async () => {
    const result = await handler(trigger("carla.schulz@example.net", PASSWORD));
    expect(result.response.userAttributes).toMatchObject({
      name: "Carla Schulz",
      "custom:legacy_ref": "telco:T/88-4712",
    });
  });

  it("rejects a wrong password and unknown users", async () => {
    await expect(handler(trigger("anna.becker@example.org", "falsch"))).rejects.toThrow(
      "Bad credentials",
    );
    await expect(handler(trigger("niemand@example.org", PASSWORD))).rejects.toThrow(
      "Bad credentials",
    );
  });

  it("creates a legacy user for a password reset without checking a password", async () => {
    const result = await handler(
      trigger("anna.becker@example.org", "", "UserMigration_ForgotPassword"),
    );
    expect(result.response.userAttributes["custom:legacy_ref"]).toBe("utility:V-1000123");
    expect(result.response.finalUserStatus).toBeUndefined();
  });

  it("reports an outage of both legacy systems as an error, not as wrong credentials", async () => {
    const down = createHandler(async () => fakeLegacy({ down: true }));
    await expect(down(trigger("anna.becker@example.org", PASSWORD))).rejects.toThrow(
      "Legacy systems unavailable",
    );
  });
});

describe("migrate user trigger for a demo pass", () => {
  const PASS = "p4k7x2qa";
  const tenants = fixedTenantStatus({ [PASS]: "active", pzzzzzzz: "deleted" });

  it("takes a demo person over into the pass tenant named by the plus suffix", async () => {
    const requests: string[] = [];
    const handler = createHandler(async () => fakeLegacy({ requests }), tenants);

    const result = await handler(trigger(`Anna.Becker+${PASS}@example.org`, PASSWORD));

    expect(result.response.userAttributes).toEqual({
      email: `anna.becker+${PASS}@example.org`,
      email_verified: "true",
      name: "Anna Becker",
      locale: "de",
      "custom:legacy_ref": "utility:V-1000123",
      "custom:migration_mode": "lazy",
      "custom:tenant_id": PASS,
    });
    // The legacy systems of the pass tenant are asked, with the address without suffix.
    expect(requests).toContain(`${PASS} /api/v1/anmeldung/pruefen`);
    expect(requests.every((r) => r.startsWith(`${PASS} `))).toBe(true);
  });

  it("checks a pass tenant's telco customers at the telco system, never at Keycloak", async () => {
    const requests: string[] = [];
    const handler = createHandler(async () => fakeLegacy({ requests }), tenants);

    const result = await handler(trigger(`carla.schulz+${PASS}@example.net`, PASSWORD));

    expect(result.response.userAttributes).toMatchObject({
      email: `carla.schulz+${PASS}@example.net`,
      "custom:legacy_ref": "telco:T/88-4712",
      "custom:tenant_id": PASS,
    });
    expect(requests).toContain(`${PASS} /v2/auth/check`);
    expect(requests.some((r) => r.includes("openid-connect"))).toBe(false);
  });

  it("finds a pass's demo person for a password reset", async () => {
    const handler = createHandler(async () => fakeLegacy(), tenants);
    const result = await handler(
      trigger(`anna.becker+${PASS}@example.org`, "", "UserMigration_ForgotPassword"),
    );
    expect(result.response.userAttributes["custom:tenant_id"]).toBe(PASS);
  });

  it.each([
    ["a tenant that is gone", "anna.becker+pzzzzzzz@example.org"],
    ["an unknown tenant", "anna.becker+pyyyyyyy@example.org"],
    ["a suffix that is no tenant id", "anna.becker+newsletter@example.org"],
  ])("treats %s as the owner's address, unchanged", async (_case, userName) => {
    const requests: string[] = [];
    const handler = createHandler(async () => fakeLegacy({ requests }), tenants);
    await expect(handler(trigger(userName, PASSWORD))).rejects.toThrow("Bad credentials");
    expect(requests.filter((r) => !r.startsWith("-")).every((r) => r.startsWith("owner "))).toBe(
      true,
    );
  });
});

describe("sign-in target", () => {
  it("reads the tenant from the plus suffix only for an active pass", async () => {
    const tenants = fixedTenantStatus({ p4k7x2qa: "active" });
    expect(await signInTarget(" Anna+p4k7x2qa@Example.org", tenants)).toEqual({
      tenantId: "p4k7x2qa",
      legacyEmail: "anna@example.org",
    });
    expect(await signInTarget("anna@example.org", tenants)).toEqual({
      tenantId: "owner",
      legacyEmail: "anna@example.org",
    });
  });
});
