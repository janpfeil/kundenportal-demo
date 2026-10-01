import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import type { Pass, PlatformTenant } from "./model.js";
import { TenancyRepository } from "./repository.js";
import { sha256 } from "./secrets.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const repository = new TenancyRepository(
  DynamoDBDocumentClient.from(new DynamoDBClient({})),
  "base",
);
const NOW = new Date("2026-09-30T12:00:00.000Z");
const failed = () => new ConditionalCheckFailedException({ message: "x", $metadata: {} });

const pass: Pass = {
  passId: "pass-1",
  tenantId: "p4k7x2qa",
  invitationId: "inv-1",
  email: "visitor@example.org",
  issuedAt: NOW.toISOString(),
  validUntil: "2026-10-07T12:00:00.000Z",
  status: "provisioning",
};
const tenant: PlatformTenant = {
  tenantId: "p4k7x2qa",
  passId: "pass-1",
  email: "visitor@example.org",
  tableName: "kp-tenant-p4k7x2qa",
  status: "provisioning",
  validUntil: pass.validUntil,
  createdAt: pass.issuedAt,
  updatedAt: pass.issuedAt,
  demoPassword: "Demo-abcd-efgh-jkmn-4",
};

beforeEach(() => dbMock.reset());

describe("tenancy repository", () => {
  it("redeems, creates pass, tenant and address lock in one transaction", async () => {
    dbMock.on(TransactWriteCommand).resolves({});
    expect(await repository.issuePass("hash", NOW, pass, tenant, 3)).toBe("issued");
    const items = dbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems ?? [];
    expect(items[0]?.Update).toMatchObject({
      Key: { PK: "INVITE#hash", SK: "META" },
      ConditionExpression:
        "attribute_exists(PK) AND attribute_not_exists(redeemedAt) AND expiresAt > :now",
    });
    expect(items[1]?.Put?.Item).toMatchObject({ PK: "PASS#pass-1", SK: "META" });
    expect(items[2]?.Put?.Item).toMatchObject({ PK: "PLATFORM", SK: "TENANT#p4k7x2qa" });
    expect(items[3]?.Put?.Item).toEqual({
      PK: `EMAIL#${sha256("visitor@example.org")}`,
      SK: "PASS",
      passId: "pass-1",
    });
    expect(items[4]?.Update).toMatchObject({
      Key: { PK: "PLATFORM", SK: "SETTINGS" },
      UpdateExpression: "ADD activeTenants :one",
      ConditionExpression: "attribute_not_exists(activeTenants) OR activeTenants < :max",
      ExpressionAttributeValues: { ":one": 1, ":max": 3 },
    });
    // The invitation leaves the overview's index in the same transaction.
    expect(items[5]).toEqual({
      Delete: { TableName: "base", Key: { PK: "PLATFORM", SK: "INVITE#inv-1" } },
    });
    expect(items).toHaveLength(6);
  });

  it("maps cancelled transactions to the failed condition", async () => {
    const cancelled = (codes: string[]) =>
      new TransactionCanceledException({
        message: "cancelled",
        $metadata: {},
        CancellationReasons: codes.map((Code) => ({ Code })),
      });
    dbMock
      .on(TransactWriteCommand)
      .rejectsOnce(cancelled(["ConditionalCheckFailed", "None", "None", "None", "None"]))
      .rejectsOnce(cancelled(["None", "None", "None", "ConditionalCheckFailed", "None"]))
      .rejectsOnce(cancelled(["None", "None", "None", "None", "ConditionalCheckFailed"]))
      .rejectsOnce(cancelled(["None", "None", "ConditionalCheckFailed", "None", "None"]));
    expect(await repository.issuePass("h", NOW, pass, tenant, 3)).toBe("invitation-gone");
    expect(await repository.issuePass("h", NOW, pass, tenant, 3)).toBe("email-taken");
    expect(await repository.issuePass("h", NOW, pass, tenant, 3)).toBe("tenants-full");
    await expect(repository.issuePass("h", NOW, pass, tenant, 3)).rejects.toThrow("cancelled");
  });

  it("stores invitations and their index entry with a TTL at their expiry", async () => {
    dbMock.on(PutCommand).resolves({});
    await repository.putInvitation("hash", {
      invitationId: "inv-1",
      email: "visitor@example.org",
      createdAt: NOW.toISOString(),
      expiresAt: "2026-10-14T12:00:00.000Z",
      createdBy: "owner",
    });
    const puts = dbMock.commandCalls(PutCommand).map((call) => call.args[0].input);
    expect(puts).toHaveLength(2);
    expect(puts[0]).toMatchObject({
      Item: { PK: "INVITE#hash", ttl: Date.parse("2026-10-14T12:00:00.000Z") / 1000 },
      ConditionExpression: "attribute_not_exists(PK)",
    });
    // Only what the overview shows: no token hash, no creator.
    expect(puts[1]?.Item).toEqual({
      PK: "PLATFORM",
      SK: "INVITE#inv-1",
      invitationId: "inv-1",
      email: "visitor@example.org",
      createdAt: NOW.toISOString(),
      expiresAt: "2026-10-14T12:00:00.000Z",
      shortLived: false,
      ttl: Date.parse("2026-10-14T12:00:00.000Z") / 1000,
    });
  });

  it("writes no index entry when the invitation cannot be stored", async () => {
    dbMock.on(PutCommand).rejectsOnce(failed());
    await expect(
      repository.putInvitation("hash", {
        invitationId: "inv-1",
        email: "visitor@example.org",
        createdAt: NOW.toISOString(),
        expiresAt: "2026-10-14T12:00:00.000Z",
        createdBy: "owner",
      }),
    ).rejects.toThrow();
    expect(dbMock.commandCalls(PutCommand)).toHaveLength(1);
  });

  it("lists open invitations across pages, newest first, without expired ones", async () => {
    const entry = (id: string, createdAt: string, expiresAt: string) => ({
      PK: "PLATFORM",
      SK: `INVITE#${id}`,
      invitationId: id,
      email: `${id}@example.org`,
      createdAt,
      expiresAt,
      shortLived: false,
      ttl: 1,
    });
    dbMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [
          entry("old", "2026-09-10T12:00:00.000Z", "2026-09-24T12:00:00.000Z"),
          entry("a", "2026-09-20T12:00:00.000Z", "2026-10-04T12:00:00.000Z"),
        ],
        LastEvaluatedKey: { PK: "PLATFORM", SK: "INVITE#a" },
      })
      .resolvesOnce({
        Items: [entry("b", "2026-09-29T12:00:00.000Z", "2026-10-13T12:00:00.000Z")],
      });

    const open = await repository.listOpenInvitations(NOW);

    expect(open.map((i) => i.invitationId)).toEqual(["b", "a"]);
    expect(open[0]).not.toHaveProperty("PK");
    const queries = dbMock.commandCalls(QueryCommand).map((call) => call.args[0].input);
    expect(queries[0]).toMatchObject({
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": "PLATFORM", ":prefix": "INVITE#" },
    });
    expect(queries[1]?.ExclusiveStartKey).toEqual({ PK: "PLATFORM", SK: "INVITE#a" });
  });

  it("reads the API calls of the asked German days from the API counter", async () => {
    dbMock.on(GetCommand).resolves({ Item: { d20260929: 4, d20260930: 11 } });
    expect(
      await repository.getApiCalls("p4k7x2qa", ["2026-09-28", "2026-09-29", "2026-09-30"]),
    ).toEqual({ "2026-09-28": 0, "2026-09-29": 4, "2026-09-30": 11 });
    expect(dbMock.commandCalls(GetCommand)[0]?.args[0].input).toEqual({
      TableName: "base",
      Key: { PK: "TENANT#p4k7x2qa", SK: "QUOTA#api" },
      ProjectionExpression: "#d0, #d1, #d2",
      ExpressionAttributeNames: { "#d0": "d20260928", "#d1": "d20260929", "#d2": "d20260930" },
    });
  });

  it("moves the status only out of the allowed states", async () => {
    dbMock.on(UpdateCommand).resolvesOnce({}).rejectsOnce(failed());
    expect(await repository.setTenantStatus("p4k7x2qa", "active", NOW, ["provisioning"])).toBe(
      true,
    );
    const input = dbMock.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(input?.ConditionExpression).toBe("attribute_exists(PK) AND #status IN (:from0)");
    expect(input?.ExpressionAttributeValues).toMatchObject({
      ":status": "active",
      ":from0": "provisioning",
    });
    expect(
      await repository.setTenantStatus("p4k7x2qa", "deleted", NOW, ["tearing-down"], NOW),
    ).toBe(false);
    expect(dbMock.commandCalls(UpdateCommand)[1]?.args[0].input.UpdateExpression).toBe(
      "SET #status = :status, updatedAt = :now, #ttl = :ttl",
    );
  });

  it("claims the reminder once, only for an active tenant, and can free the claim", async () => {
    dbMock.on(UpdateCommand).resolvesOnce({}).rejectsOnce(failed()).resolvesOnce({});
    expect(await repository.markReminderSent("p4k7x2qa", NOW)).toBe(true);
    expect(dbMock.commandCalls(UpdateCommand)[0]?.args[0].input).toMatchObject({
      Key: { PK: "PLATFORM", SK: "TENANT#p4k7x2qa" },
      UpdateExpression: "SET reminderSentAt = :now",
      ConditionExpression:
        "attribute_exists(PK) AND attribute_not_exists(reminderSentAt) AND #status = :active",
    });
    expect(await repository.markReminderSent("p4k7x2qa", NOW)).toBe(false);
    expect(await repository.markReminderSent("p4k7x2qa", NOW, true)).toBe(true);
    expect(dbMock.commandCalls(UpdateCommand)[2]?.args[0].input).toMatchObject({
      UpdateExpression: "REMOVE reminderSentAt",
      ConditionExpression: "reminderSentAt = :now",
    });
  });

  it("activates tenant and pass together, once", async () => {
    dbMock
      .on(TransactWriteCommand)
      .resolvesOnce({})
      .rejectsOnce(
        new TransactionCanceledException({
          message: "cancelled",
          $metadata: {},
          CancellationReasons: [{ Code: "ConditionalCheckFailed" }, { Code: "None" }],
        }),
      );
    const until = new Date("2026-10-02T12:00:00.000Z");
    expect(await repository.activateTenant(tenant, NOW, until)).toBe(true);
    const items = dbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems ?? [];
    expect(items[0]?.Update).toMatchObject({
      Key: { PK: "PLATFORM", SK: "TENANT#p4k7x2qa" },
      UpdateExpression: "SET activatedAt = :now, validUntil = :until",
      ExpressionAttributeValues: { ":until": until.toISOString(), ":pass": "pass-1" },
    });
    expect(items[0]?.Update?.ConditionExpression).toContain("attribute_not_exists(activatedAt)");
    expect(items[1]?.Update).toMatchObject({
      Key: { PK: "PASS#pass-1", SK: "META" },
      UpdateExpression: "SET activatedAt = :now, validUntil = :until",
    });
    expect(await repository.activateTenant(tenant, NOW)).toBe(false);
    const short = dbMock.commandCalls(TransactWriteCommand)[1]?.args[0].input.TransactItems;
    expect(short?.[1]?.Update?.UpdateExpression).toBe("SET activatedAt = :now");
  });

  it("counts attempts in hourly windows", async () => {
    dbMock.on(UpdateCommand).resolvesOnce({});
    expect(await repository.countAttempt("ip", 10, NOW)).toBe(true);
    dbMock.reset();
    dbMock.on(UpdateCommand).rejectsOnce(failed()).resolvesOnce({});
    expect(await repository.countAttempt("ip", 10, NOW)).toBe(true);
    expect(dbMock.commandCalls(UpdateCommand)[1]?.args[0].input).toMatchObject({
      Key: { PK: "RATE#ip", SK: "REDEEM" },
      UpdateExpression: "ADD attempts :one",
      ConditionExpression: "attempts < :limit",
    });
    dbMock.reset();
    dbMock.on(UpdateCommand).rejects(failed());
    expect(await repository.countAttempt("ip", 10, NOW)).toBe(false);
  });

  it("remembers used challenges", async () => {
    dbMock.on(PutCommand).resolvesOnce({}).rejectsOnce(failed());
    expect(await repository.useChallenge("sig", NOW)).toBe(true);
    expect(await repository.useChallenge("sig", NOW)).toBe(false);
    expect(dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item).toEqual({
      PK: `ALTCHA#${sha256("sig")}`,
      SK: "USED",
      ttl: NOW.getTime() / 1000,
    });
  });

  it("reads settings with defaults and quota counters by kind", async () => {
    dbMock.on(GetCommand).resolves({});
    expect(await repository.getSettings()).toEqual({ redemption: "open", maxTenants: 3 });
    dbMock.on(QueryCommand).resolves({
      Items: [
        { PK: "TENANT#p4k7x2qa", SK: "QUOTA#api", used: 12 },
        { PK: "TENANT#p4k7x2qa", SK: "QUOTA#events", used: 3 },
      ],
    });
    expect(await repository.getQuotaUsage("p4k7x2qa")).toEqual({ api: 12, events: 3, uploads: 0 });
  });

  it("reads the tenant's last activity from its API counter", async () => {
    dbMock.on(GetCommand).resolves({ Item: { lastActiveAt: "2026-10-01T08:00:00.000Z" } });
    expect(await repository.getLastActivity("p4k7x2qa")).toBe("2026-10-01T08:00:00.000Z");
    expect(dbMock.commandCalls(GetCommand)[0]?.args[0].input.Key).toEqual({
      PK: "TENANT#p4k7x2qa",
      SK: "QUOTA#api",
    });
    dbMock.on(GetCommand).resolves({});
    expect(await repository.getLastActivity("p4k7x2qa")).toBeUndefined();
  });

  it("pages through the platform tenants", async () => {
    dbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [tenant], LastEvaluatedKey: { PK: "PLATFORM", SK: "x" } })
      .resolvesOnce({ Items: [{ ...tenant, tenantId: "pbbbbbbb" }] });
    expect((await repository.listTenants()).map((t) => t.tenantId)).toEqual([
      "p4k7x2qa",
      "pbbbbbbb",
    ]);
  });

  it("marks a tenant deleted and frees its place of the cap in one transaction", async () => {
    const cancelled = (codes: string[]) =>
      new TransactionCanceledException({
        message: "cancelled",
        $metadata: {},
        CancellationReasons: codes.map((Code) => ({ Code })),
      });
    dbMock
      .on(TransactWriteCommand)
      .resolvesOnce({})
      .rejectsOnce(cancelled(["ConditionalCheckFailed", "None"]))
      .rejectsOnce(cancelled(["None", "ConditionalCheckFailed"]));
    dbMock.on(UpdateCommand).resolves({});
    const keep = new Date("2026-10-30T12:00:00.000Z");

    expect(await repository.markTenantDeleted("p4k7x2qa", NOW, keep)).toBe(true);
    const items = dbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems ?? [];
    expect(items[0]?.Update).toMatchObject({
      Key: { PK: "PLATFORM", SK: "TENANT#p4k7x2qa" },
      ConditionExpression: "attribute_exists(PK) AND #status <> :status",
      ExpressionAttributeValues: { ":status": "deleted", ":ttl": keep.getTime() / 1000 },
    });
    expect(items[1]?.Update).toMatchObject({
      Key: { PK: "PLATFORM", SK: "SETTINGS" },
      UpdateExpression: "ADD activeTenants :minusOne",
      ConditionExpression: "activeTenants > :zero",
    });

    // Already deleted: nothing to free.
    expect(await repository.markTenantDeleted("p4k7x2qa", NOW, keep)).toBe(false);
    expect(dbMock.commandCalls(UpdateCommand)).toHaveLength(0);

    // Counter missing or 0: the tenant is still marked, the counter left alone.
    expect(await repository.markTenantDeleted("p4k7x2qa", NOW, keep)).toBe(true);
    expect(dbMock.commandCalls(UpdateCommand)[0]?.args[0].input.Key).toEqual({
      PK: "PLATFORM",
      SK: "TENANT#p4k7x2qa",
    });
  });

  it("corrects the counter only if nobody changed it meanwhile", async () => {
    dbMock.on(UpdateCommand).resolvesOnce({}).rejectsOnce(failed());
    expect(await repository.setActiveTenants(2, 3)).toBe(true);
    expect(dbMock.commandCalls(UpdateCommand)[0]?.args[0].input).toMatchObject({
      UpdateExpression: "SET activeTenants = :count",
      ConditionExpression: "activeTenants = :seen",
      ExpressionAttributeValues: { ":count": 2, ":seen": 3 },
    });
    expect(await repository.setActiveTenants(2, undefined)).toBe(false);
    expect(dbMock.commandCalls(UpdateCommand)[1]?.args[0].input.ConditionExpression).toBe(
      "attribute_not_exists(activeTenants)",
    );
  });

  it("updates the settings; reopening removes when and why it was closed", async () => {
    dbMock.on(UpdateCommand).resolves({
      Attributes: { PK: "PLATFORM", SK: "SETTINGS", redemption: "open", maxTenants: 4 },
    });
    expect(await repository.updateSettings({ redemption: "open", maxTenants: 4 }, NOW)).toEqual({
      redemption: "open",
      maxTenants: 4,
    });
    expect(dbMock.commandCalls(UpdateCommand)[0]?.args[0].input.UpdateExpression).toBe(
      "SET maxTenants = :max, redemption = :open REMOVE closedAt, closedReason",
    );
    await repository.updateSettings({ redemption: "closed" }, NOW);
    expect(dbMock.commandCalls(UpdateCommand)[1]?.args[0].input).toMatchObject({
      UpdateExpression:
        "SET redemption = :closed, closedAt = if_not_exists(closedAt, :now), " +
        "closedReason = if_not_exists(closedReason, :reason)",
      ExpressionAttributeValues: { ":reason": "Vom Inhaber gesperrt" },
    });
  });

  it("keeps a finished pass and its address lock for a while", async () => {
    dbMock.on(UpdateCommand).resolves({});
    await repository.updatePass(pass, { status: "deleted" }, NOW);
    const [passUpdate, lockUpdate] = dbMock.commandCalls(UpdateCommand);
    expect(passUpdate?.args[0].input.UpdateExpression).toBe("SET #f0 = :f0, #ttl = :ttl");
    expect(lockUpdate?.args[0].input.Key).toEqual({
      PK: `EMAIL#${sha256("visitor@example.org")}`,
      SK: "PASS",
    });
  });
});
