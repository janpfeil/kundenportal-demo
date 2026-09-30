import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { cachedLegacyAccess, LEGACY_PARAMETER_ENV } from "./access.js";

const ssmMock = mockClient(SSMClient);
const names = Object.fromEntries(
  Object.values(LEGACY_PARAMETER_ENV).map((env) => [env, `/kundenportal/legacy/${env}`]),
);
const parameters = Object.values(names).map((Name) => ({
  Name,
  Value: Name.includes("URL") || Name.includes("ISSUER") ? "https://example.org" : "value",
}));

beforeEach(() => {
  ssmMock.reset();
  Object.assign(process.env, names);
});

describe("cached legacy access", () => {
  it("loads the parameters once and reuses them", async () => {
    ssmMock.on(GetParametersCommand).resolves({ Parameters: parameters });
    const access = cachedLegacyAccess(new SSMClient({}));
    expect(await access()).toBe(await access());
    expect(ssmMock.commandCalls(GetParametersCommand)).toHaveLength(1);
  });

  it("forgets a failed load, so a later invocation tries again", async () => {
    ssmMock
      .on(GetParametersCommand)
      .resolvesOnce({ Parameters: [] })
      .resolves({ Parameters: parameters });
    const access = cachedLegacyAccess(new SSMClient({}));
    await expect(access()).rejects.toThrow("is missing");
    await expect(access()).resolves.toBeDefined();
  });
});
