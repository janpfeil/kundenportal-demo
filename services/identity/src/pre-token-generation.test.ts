import type { PreTokenGenerationV2TriggerEvent } from "aws-lambda";
import { fixedTenantStatus } from "@kundenportal/service-kit/testing";
import { describe, expect, it } from "vitest";
import { createHandler, handler } from "./pre-token-generation.js";

function trigger(userAttributes: Record<string, string>): PreTokenGenerationV2TriggerEvent {
  return {
    version: "2",
    triggerSource: "TokenGeneration_Authentication",
    region: "eu-central-1",
    userPoolId: "eu-central-1_pool",
    userName: "sub-1",
    callerContext: { awsSdkVersion: "3", clientId: "client" },
    request: {
      userAttributes: { sub: "sub-1", ...userAttributes },
      groupConfiguration: { groupsToOverride: [], iamRolesToOverride: [] },
      scopes: ["openid", "kundenportal/profile.read"],
    },
    response: { claimsAndScopeOverrideDetails: null },
  } as unknown as PreTokenGenerationV2TriggerEvent;
}

const accessClaims = async (attributes: Record<string, string>) =>
  (await handler(trigger(attributes))).response.claimsAndScopeOverrideDetails?.accessTokenGeneration
    ?.claimsToAddOrOverride;

describe("pre token generation", () => {
  it("adds tenant, verified email, locale and name to the access token", async () => {
    expect(
      await accessClaims({
        email: "anna@example.org",
        email_verified: "true",
        locale: "de",
        name: "Anna Becker",
      }),
    ).toEqual({ tenant_id: "owner", email: "anna@example.org", locale: "de", name: "Anna Becker" });
  });

  it("never passes on an unverified email", async () => {
    expect(await accessClaims({ email: "anna@example.org", email_verified: "false" })).toEqual({
      tenant_id: "owner",
    });
  });

  it("keeps a tenant stored on the user", async () => {
    expect(await accessClaims({ "custom:tenant_id": "pass-42" })).toMatchObject({
      tenant_id: "pass-42",
    });
  });

  it("marks accounts taken over from a legacy system with their origin", async () => {
    expect(await accessClaims({ "custom:legacy_ref": "telco:T/88-4711" })).toMatchObject({
      origin: "legacy-telco",
    });
    expect(await accessClaims({})).not.toHaveProperty("origin");
  });
});

describe("pre token generation for a demo pass", () => {
  const announced: string[] = [];
  const passHandler = createHandler(
    async (attributes) => {
      announced.push(attributes.sub ?? "");
    },
    fixedTenantStatus({
      pactivee: "active",
      pquotaaa: "quota-exceeded",
      pdeleted: "deleted",
      ptearing: "tearing-down",
    }),
  );
  const claimsOf = async (tenantId: string) =>
    (await passHandler(trigger({ "custom:tenant_id": tenantId }))).response
      .claimsAndScopeOverrideDetails?.accessTokenGeneration?.claimsToAddOrOverride;

  it("issues the pass tenant's token while the pass is usable", async () => {
    expect(await claimsOf("pactivee")).toMatchObject({ tenant_id: "pactivee" });
    expect(await claimsOf("pquotaaa")).toMatchObject({ tenant_id: "pquotaaa" });
  });

  it.each(["pdeleted", "ptearing", "punknown"])(
    "refuses the sign-in for pass %s",
    async (tenantId) => {
      announced.length = 0;
      await expect(claimsOf(tenantId)).rejects.toThrow(/Demo-Pass/);
      expect(announced).toEqual([]);
    },
  );
});
