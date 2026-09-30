import type { UserMigrationTriggerEvent } from "aws-lambda";
import { describe, expect, it } from "vitest";
import { fakeLegacy, PASSWORD } from "./testing.js";
import { createHandler } from "./user-migration.js";

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
