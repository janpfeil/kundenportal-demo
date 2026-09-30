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
    expect(await repository.issuePass("hash", NOW, pass, tenant)).toBe("issued");
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
      .rejectsOnce(cancelled(["ConditionalCheckFailed", "None", "None", "None"]))
      .rejectsOnce(cancelled(["None", "None", "None", "ConditionalCheckFailed"]))
      .rejectsOnce(cancelled(["None", "None", "ConditionalCheckFailed", "None"]));
    expect(await repository.issuePass("h", NOW, pass, tenant)).toBe("invitation-gone");
    expect(await repository.issuePass("h", NOW, pass, tenant)).toBe("email-taken");
    await expect(repository.issuePass("h", NOW, pass, tenant)).rejects.toThrow("cancelled");
  });

  it("stores invitations with a TTL at their expiry", async () => {
    dbMock.on(PutCommand).resolves({});
    await repository.putInvitation("hash", {
      invitationId: "inv-1",
      email: "visitor@example.org",
      createdAt: NOW.toISOString(),
      expiresAt: "2026-10-14T12:00:00.000Z",
      createdBy: "owner",
    });
    expect(dbMock.commandCalls(PutCommand)[0]?.args[0].input.Item).toMatchObject({
      PK: "INVITE#hash",
      ttl: Date.parse("2026-10-14T12:00:00.000Z") / 1000,
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
