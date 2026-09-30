import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createTenantDataSource, isPassTenant, OWNER_TENANT } from "./tenant-data.js";

const stsMock = mockClient(STSClient);
const ROLE = "arn:aws:iam::123456789012:role/kundenportal-tenant-data";
const START = Date.parse("2026-09-30T12:00:00.000Z");

let clock: number;
let issued: number;

function source(minValiditySeconds?: number) {
  return createTenantDataSource({
    baseTable: "kundenportal",
    roleArn: ROLE,
    sts: new STSClient({}),
    now: () => clock,
    ...(minValiditySeconds === undefined ? {} : { minValiditySeconds }),
  });
}

beforeEach(() => {
  stsMock.reset();
  clock = START;
  issued = 0;
  stsMock.on(AssumeRoleCommand).callsFake(() => {
    issued += 1;
    return {
      Credentials: {
        AccessKeyId: `ASIA${issued}`,
        SecretAccessKey: "secret",
        SessionToken: `token-${issued}`,
        Expiration: new Date(clock + 900_000),
      },
    };
  });
});

describe("tenant ids", () => {
  it("accepts only p plus seven base32 characters as pass tenants", () => {
    expect(isPassTenant("p4k7x2qa")).toBe(true);
    expect(isPassTenant(OWNER_TENANT)).toBe(false);
    expect(isPassTenant("p4k7x2q")).toBe(false);
    expect(isPassTenant("p4k7x2q1")).toBe(false);
    expect(isPassTenant("P4K7X2QA")).toBe(false);
  });
});

describe("createTenantDataSource", () => {
  it("gives the owner the base table with the Lambda's own credentials", async () => {
    const data = await source()(OWNER_TENANT);
    expect(data.tableName).toBe("kundenportal");
    expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(0);
  });

  it("gives a pass tenant its own table with vended, tagged credentials", async () => {
    const data = await source()("p4k7x2qa");

    expect(data.tableName).toBe("kp-tenant-p4k7x2qa");
    expect(data.tableName).not.toBe("kundenportal");
    const [call] = stsMock.commandCalls(AssumeRoleCommand);
    expect(call?.args[0].input).toEqual({
      RoleArn: ROLE,
      RoleSessionName: "tenant-p4k7x2qa",
      DurationSeconds: 900,
      Tags: [{ Key: "tenant", Value: "p4k7x2qa" }],
    });
    const credentials = await data.db.config.credentials();
    expect(credentials).toMatchObject({ accessKeyId: "ASIA1", sessionToken: "token-1" });
    expect(await data.s3.config.credentials()).toMatchObject({ accessKeyId: "ASIA1" });
  });

  it("uses the table prefix from the options", async () => {
    const data = await createTenantDataSource({
      baseTable: "kundenportal",
      roleArn: ROLE,
      tablePrefix: "demo-",
      sts: new STSClient({}),
    })("p4k7x2qa");
    expect(data.tableName).toBe("demo-p4k7x2qa");
  });

  it("refuses unknown tenant ids without asking STS", async () => {
    const tenants = source();
    await expect(tenants("kp-tenant-x")).rejects.toThrow(/Unknown tenant/);
    await expect(tenants("")).rejects.toThrow(/Unknown tenant/);
    expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(0);
  });

  it("caches per tenant and never hands tenant A's clients to tenant B", async () => {
    const tenants = source();
    const a1 = await tenants("paaaaaaa");
    const b = await tenants("pbbbbbbb");
    const a2 = await tenants("paaaaaaa");

    expect(a2).toBe(a1);
    expect(b.db).not.toBe(a1.db);
    expect(b.s3).not.toBe(a1.s3);
    expect(b.tableName).toBe("kp-tenant-pbbbbbbb");
    expect(await b.db.config.credentials()).toMatchObject({ accessKeyId: "ASIA2" });
    const sessions = stsMock
      .commandCalls(AssumeRoleCommand)
      .map((call) => call.args[0].input.Tags?.[0]?.Value);
    expect(sessions).toEqual(["paaaaaaa", "pbbbbbbb"]);
  });

  it("shares one STS request between concurrent calls of a tenant", async () => {
    const tenants = source();
    const [x, y] = await Promise.all([tenants("paaaaaaa"), tenants("paaaaaaa")]);
    expect(x).toBe(y);
    expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(1);
  });

  it("renews the credentials shortly before they expire", async () => {
    const tenants = source(360);
    const first = await tenants("paaaaaaa");
    clock = START + 500_000;
    expect(await tenants("paaaaaaa")).toBe(first);
    clock = START + 560_000;
    const renewed = await tenants("paaaaaaa");
    expect(renewed).not.toBe(first);
    expect(await renewed.db.config.credentials()).toMatchObject({ accessKeyId: "ASIA2" });
  });

  it("does not cache a failed STS call", async () => {
    stsMock.on(AssumeRoleCommand).rejectsOnce(new Error("throttled"));
    const tenants = source();
    await expect(tenants("paaaaaaa")).rejects.toThrow("throttled");
    stsMock.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: "ASIAOK",
        SecretAccessKey: "secret",
        SessionToken: "token",
        Expiration: new Date(clock + 900_000),
      },
    });
    const data = await tenants("paaaaaaa");
    expect(await data.db.config.credentials()).toMatchObject({ accessKeyId: "ASIAOK" });
  });
});
