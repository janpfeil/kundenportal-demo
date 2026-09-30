import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { apiEvent } from "@kundenportal/service-kit/testing";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountProvisioner, portalEmail } from "./accounts.js";
import { createHandler } from "./api.js";
import { BulkImport } from "./bulk.js";
import { Cockpit } from "./cockpit.js";
import { Linking } from "./links.js";
import { testContext } from "./testing.js";
import { createProcessor, createWorker } from "./worker.js";

const PASS = "p4k7x2qa";
const GONE = "pzzzzzzz";
const carla = { system: "telco" as const, customerNumber: "T/88-4712" };
const cognitoMock = mockClient(CognitoIdentityProviderClient);
const dbMock = mockClient(DynamoDBDocumentClient);

function setup() {
  const t = testContext({ [PASS]: "active", [GONE]: "deleted" });
  const bulk = new BulkImport(t.ctx);
  const linking = new Linking(t.ctx);
  const cockpit = new Cockpit(t.ctx);
  return { ...t, bulk, cockpit, api: createHandler(bulk, linking, cockpit), linking };
}

beforeEach(() => {
  cognitoMock.reset();
  dbMock.reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("demo reset of a pass tenant", () => {
  it("clears the pass's records but never purges the shared DLQ", async () => {
    const s = setup();
    await s.repository.putRecord(PASS, {
      account: carla,
      displayName: "Carla",
      status: "failed",
      attempts: 1,
      updatedAt: "x",
    });
    const result = await s.cockpit.reset({ tenantId: PASS, subject: "holder" });
    expect(result.recordsRemoved).toBeGreaterThan(0);
    expect(await s.repository.listRecords(PASS)).toEqual([]);
    expect(s.purges()).toBe(0);

    await s.cockpit.reset({ tenantId: "owner", subject: "owner-sub" });
    expect(s.purges()).toBe(1);
  });
});

describe("record processor", () => {
  it.each([
    ["a deleted tenant", GONE],
    ["an unknown tenant", "pyyyyyyy"],
  ])("drops the task of %s without error", async (_case, tenantId) => {
    const s = setup();
    await expect(
      createProcessor(s.bulk)({ tenantId, account: carla, correlationId: "c" }),
    ).resolves.toBeUndefined();
    expect(s.provisioned).toEqual([]);
    expect(s.published).toEqual([]);
    expect(await s.repository.listRecords(tenantId)).toEqual([]);
  });

  it("migrates a pass tenant's record into the pass with a plus address", async () => {
    const s = setup();
    await createProcessor(s.bulk)({ tenantId: PASS, account: carla, correlationId: "c" });
    expect(s.provisioned).toEqual([`${PASS}:carla.schulz@example.net`]);
    const migrated = s.published.find((p) => p.detailType === "LegacyAccountMigrated");
    expect(migrated?.detail).toMatchObject({
      tenantId: PASS,
      payload: { email: `carla.schulz+${PASS}@example.net` },
    });
  });
});

describe("timeline", () => {
  it("records events of usable tenants only", async () => {
    const s = setup();
    const worker = createWorker(s.bulk, s.linking, s.cockpit);
    const event = (tenantId: string, eventId: string) => ({
      source: "kundenportal.tenancy",
      "detail-type": "TenantDeleted",
      detail: { tenantId, eventId, occurredAt: "2026-09-30T12:00:00.000Z", payload: {} },
    });
    await worker(event(PASS, "e-1"));
    await worker(event(GONE, "e-2"));
    expect(s.repository.timeline.map((entry) => entry.eventId)).toEqual(["e-1"]);
  });
});

describe("bulk accounts of a pass tenant", () => {
  const provisioner = new AccountProvisioner(new CognitoIdentityProviderClient({}), "pool");

  it("creates the account with the plus address and binds it to the tenant", async () => {
    cognitoMock.on(AdminCreateUserCommand).resolves({
      User: { Attributes: [{ Name: "sub", Value: "sub-1" }] },
    });
    cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

    const result = await provisioner.provision(PASS, carla, "carla.schulz@example.net", "Carla");

    expect(result).toEqual({ ok: true, subject: "sub-1", created: true });
    const input = cognitoMock.commandCalls(AdminCreateUserCommand)[0]?.args[0].input;
    expect(input?.Username).toBe(`carla.schulz+${PASS}@example.net`);
    expect(input?.UserAttributes).toEqual(
      expect.arrayContaining([
        { Name: "email", Value: `carla.schulz+${PASS}@example.net` },
        { Name: "custom:tenant_id", Value: PASS },
      ]),
    );
  });

  it("keeps the owner's accounts without suffix and tenant attribute", async () => {
    cognitoMock.on(AdminCreateUserCommand).resolves({
      User: { Attributes: [{ Name: "sub", Value: "sub-1" }] },
    });
    await provisioner.provision("owner", carla, "carla.schulz@example.net", "Carla");
    const input = cognitoMock.commandCalls(AdminCreateUserCommand)[0]?.args[0].input;
    expect(input?.Username).toBe("carla.schulz@example.net");
    expect(input?.UserAttributes?.map((a) => a.Name)).not.toContain("custom:tenant_id");
  });

  it("does not take over an existing account of another tenant", async () => {
    cognitoMock
      .on(AdminCreateUserCommand)
      .rejects(new UsernameExistsException({ message: "exists", $metadata: {} }));
    cognitoMock.on(AdminGetUserCommand).resolves({
      UserAttributes: [
        { Name: "sub", Value: "sub-other" },
        { Name: "custom:legacy_ref", Value: "telco:T/88-4712" },
        { Name: "custom:tenant_id", Value: "pbbbbbbb" },
      ],
    });
    const result = await provisioner.provision(PASS, carla, "carla.schulz@example.net", "C");
    expect(result.ok).toBe(false);
  });

  it("builds the plus address from the last @", () => {
    expect(portalEmail(PASS, "a.b@example.org")).toBe(`a.b+${PASS}@example.org`);
    expect(portalEmail("owner", "a.b@example.org")).toBe("a.b@example.org");
  });
});

describe("cockpit access of a pass holder", () => {
  const holder = { sub: "holder", tenant_id: PASS, "cognito:groups": "[pass]" };

  beforeEach(() => {
    // The router's quota guard reads the pass's status from the base table.
    vi.stubEnv("TABLE_NAME", "base-table");
    dbMock
      .on(GetCommand, { Key: { PK: "PLATFORM", SK: `TENANT#${PASS}` } })
      .resolves({ Item: { status: "active" } });
    dbMock.on(UpdateCommand).resolves({});
  });

  it("opens the cockpit of the own pass tenant to the pass group", async () => {
    const s = setup();
    const response = await s.api(apiEvent("GET /migration/status", { claims: holder }));
    expect(response.statusCode).toBe(200);
  });

  it("keeps the pass group out of the owner's tenant", async () => {
    const s = setup();
    const response = await s.api(
      apiEvent("GET /migration/status", { claims: { ...holder, tenant_id: "owner" } }),
    );
    expect(response.statusCode).toBe(403);
  });
});
