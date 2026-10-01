import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { json, router } from "./http.js";
import { createApiQuota, TenantDirectory } from "./platform.js";
import { apiEvent } from "./testing/api-event.js";
import { fixedTenantData } from "./testing/tenant-data.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const base = fixedTenantData("kundenportal");
const PASS = "p4k7x2qa";

const conditionFailed = () =>
  new ConditionalCheckFailedException({ message: "failed", $metadata: {} });

function platformStatus(status: string | undefined) {
  dbMock
    .on(GetCommand, { Key: { PK: "PLATFORM", SK: `TENANT#${PASS}` } })
    .resolves(status ? { Item: { status } } : {});
}

beforeEach(() => {
  dbMock.reset();
  dbMock.on(UpdateCommand).resolves({});
});

describe("TenantDirectory", () => {
  it("reads the status from the platform item and caches it for a while", async () => {
    let clock = 0;
    platformStatus("active");
    const directory = new TenantDirectory({ data: base, ttlMs: 30_000, now: () => clock });

    expect(await directory.status(PASS)).toBe("active");
    platformStatus("deleted");
    clock = 29_000;
    expect(await directory.isActive(PASS)).toBe(true);
    clock = 31_000;
    expect(await directory.isActive(PASS)).toBe(false);
    expect(dbMock.commandCalls(GetCommand)).toHaveLength(2);
    expect(dbMock.commandCalls(GetCommand)[0]?.args[0].input.TableName).toBe("kundenportal");
  });

  it("knows the owner without a lookup and no status for unknown ids", async () => {
    const directory = new TenantDirectory({ data: base });
    expect(await directory.status("owner")).toBe("active");
    expect(await directory.status("someone")).toBeUndefined();
    platformStatus(undefined);
    expect(await directory.status(PASS)).toBeUndefined();
  });
});

describe("API quota", () => {
  const quota = (limit = 5000) =>
    createApiQuota({
      data: base,
      directory: new TenantDirectory({ data: base }),
      limit,
      now: () => new Date("2026-10-01T08:00:00.000Z"),
    });

  it("counts a call of an active pass atomically in the base table", async () => {
    platformStatus("active");
    await quota(5000)(PASS);

    const [call] = dbMock.commandCalls(UpdateCommand);
    expect(call?.args[0].input).toMatchObject({
      TableName: "kundenportal",
      Key: { PK: `TENANT#${PASS}`, SK: "QUOTA#api" },
      // The same write records the tenant's last activity for the owner's cockpit and
      // counts the call on its German day.
      UpdateExpression: "ADD #used :one, #day :one SET #lastActiveAt = :now",
      ConditionExpression: "attribute_not_exists(#used) OR #used < :limit",
      ExpressionAttributeNames: {
        "#used": "used",
        "#day": "d20261001",
        "#lastActiveAt": "lastActiveAt",
      },
      ExpressionAttributeValues: {
        ":one": 1,
        ":limit": 5000,
        ":now": "2026-10-01T08:00:00.000Z",
      },
    });
    expect(dbMock.commandCalls(UpdateCommand)).toHaveLength(1);
  });

  it("counts a call shortly before midnight UTC on the next German day", async () => {
    platformStatus("active");
    await createApiQuota({
      data: base,
      directory: new TenantDirectory({ data: base }),
      limit: 5000,
      now: () => new Date("2026-10-01T22:15:00.000Z"),
    })(PASS);

    expect(dbMock.commandCalls(UpdateCommand)).toHaveLength(1);
    const [call] = dbMock.commandCalls(UpdateCommand);
    expect(call?.args[0].input.ExpressionAttributeNames?.["#day"]).toBe("d20261002");
  });

  it("refuses with 429 once the limit is reached", async () => {
    platformStatus("active");
    dbMock.on(UpdateCommand).rejects(conditionFailed());
    await expect(quota()(PASS)).rejects.toMatchObject({
      status: 429,
      title: "Kontingent erschöpft",
    });
  });

  it("refuses with 429 when the tenancy service marked the pass as exhausted", async () => {
    platformStatus("quota-exceeded");
    await expect(quota()(PASS)).rejects.toMatchObject({ status: 429 });
    expect(dbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it.each(["provisioning", "tearing-down", "deleted", undefined])(
    "refuses with 403 when the pass is %s",
    async (status) => {
      platformStatus(status);
      await expect(quota()(PASS)).rejects.toMatchObject({ status: 403 });
      expect(dbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    },
  );

  it("never counts the owner", async () => {
    await quota()("owner");
    expect(dbMock.calls()).toHaveLength(0);
  });
});

describe("router with tenant guard", () => {
  const seen: string[] = [];
  const handle = router(
    { "GET /ok": async () => json(200, { ok: true }) },
    {
      tenantGuard: async (tenantId) => {
        seen.push(tenantId);
      },
    },
  );

  beforeEach(() => {
    seen.length = 0;
  });

  it("runs the guard for pass tenants only", async () => {
    expect((await handle(apiEvent("GET /ok"))).statusCode).toBe(200);
    expect((await handle(apiEvent("GET /ok", { claims: { tenant_id: PASS } }))).statusCode).toBe(
      200,
    );
    expect(seen).toEqual([PASS]);
  });

  it("answers the guard's refusal as problem details", async () => {
    const guarded = router(
      { "GET /ok": async () => json(200, { ok: true }) },
      { tenantGuard: createApiQuota({ data: base }) },
    );
    platformStatus("active");
    dbMock.on(UpdateCommand).rejects(conditionFailed());

    const result = await guarded(apiEvent("GET /ok", { claims: { tenant_id: PASS } }));

    expect(result.statusCode).toBe(429);
    expect(result.headers?.["content-type"]).toBe("application/problem+json");
    expect(JSON.parse(result.body ?? "")).toMatchObject({ title: "Kontingent erschöpft" });
  });

  it("does not run the guard for unknown routes", async () => {
    await handle(apiEvent("GET /nope", { claims: { tenant_id: PASS } }));
    expect(seen).toEqual([]);
  });
});
