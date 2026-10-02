import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { fixedTenantData } from "@kundenportal/service-kit/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { backfillContractDirectory } from "./directory-backfill.js";
import { demoContracts } from "./origins.js";
import { ContractRepository } from "./repository.js";
import { contractItem, fixture, linkItem } from "./testing/fixture.js";

const f = fixture();
const data = fixedTenantData();
const repository = new ContractRepository(data);
const waits: number[] = [];
let elapsed = 0;
const options = {
  clock: f.clock,
  pace: { pageSize: 3 },
  wait: async (ms: number) => {
    waits.push(ms);
    elapsed += ms;
  },
  now: () => elapsed,
};

/** Contracts as phase 6 left them: no `listed`, no directory entry, no customer name. */
const old = demoContracts(
  "c-1",
  "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  "2026-09-30T12:00:00.000Z",
).map(({ listed: _listed, customerName: _name, ...record }) => record);

beforeEach(() => {
  f.reset();
  waits.length = 0;
  elapsed = 0;
  f.table.put(linkItem());
  for (const record of old) f.table.put(contractItem(record));
  // Neither contracts nor anything the backfill must touch:
  f.table.put({ PK: "TENANT#owner#CUST#c-1", SK: `HISTORY#${old[0]?.contractId}#000001` });
  f.table.put({ PK: "TENANT#owner#CUST#c-9", SK: "CONTRACT#gas#broken" });
  f.table.put({ PK: "TENANT#p4k7x2qa#CUST#c-2", SK: "CONTRACT#gas#other-tenant" });
  f.table.put({ PK: "PLATFORM#QUOTA", SK: "x" });
});

describe("backfillContractDirectory", () => {
  it("lists every contract from before phase 7 once, with the customer's name", async () => {
    const result = await backfillContractDirectory(data, repository, "owner", options);

    expect(result).toMatchObject({ contracts: 3, added: 3 });
    expect(result.finishedBefore).toBeUndefined();
    for (const record of old) {
      expect(f.table.get("TENANT#owner#CONTRACTS", `CONTRACT#${record.contractId}`)).toMatchObject({
        customerId: "c-1",
        customerName: "Anna Muster",
        division: record.division,
      });
      expect(
        f.table.get(`TENANT#owner#CUST#c-1`, `CONTRACT#${record.division}#${record.contractId}`),
      ).toMatchObject({ listed: true, customerName: "Anna Muster" });
    }
    expect(f.table.get("TENANT#owner#BACKFILL", "CONTRACTS#v1")).toEqual({
      PK: "TENANT#owner#BACKFILL",
      SK: "CONTRACTS#v1",
      finishedAt: "2026-10-02T10:00:00.000Z",
      contracts: 3,
      added: 3,
    });
    // Snapshots of every contract for the customer directory.
    expect(result.snapshots.map((s) => s.contractId).sort()).toEqual(
      old.map((r) => r.contractId).sort(),
    );
    expect(result.snapshots[0]).toMatchObject({ customerId: "c-1", version: 1 });
    // The other tenant's contract stays untouched.
    expect(f.table.get("TENANT#p4k7x2qa#CONTRACTS", "CONTRACT#other-tenant")).toBeUndefined();
  });

  it("spaces the writes and pauses between scan pages", async () => {
    await backfillContractDirectory(data, repository, "owner", options);
    // 3 contracts × 2 writes at 2 per second: every write after the first waits 500 ms.
    expect(waits.filter((ms) => ms === 500)).toHaveLength(5);
    // Pages of 3 items: pauses of 1 s between them.
    expect(waits).toContain(1000);
  });

  it("writes nothing on a second run but still hands out the snapshots", async () => {
    await backfillContractDirectory(data, repository, "owner", options);
    f.dbMock.resetHistory();

    const again = await backfillContractDirectory(data, repository, "owner", options);

    expect(again).toMatchObject({
      contracts: 3,
      added: 0,
      finishedBefore: "2026-10-02T10:00:00.000Z",
    });
    expect(again.snapshots).toHaveLength(3);
    expect(f.dbMock.commandCalls(PutCommand)).toHaveLength(0);
    expect(f.dbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it("leaves contracts listed since phase 7 alone", async () => {
    const [first] = old;
    if (!first) throw new Error("demo contract missing");
    f.table.put(contractItem({ ...first, listed: true }));

    const result = await backfillContractDirectory(data, repository, "owner", options);

    expect(result).toMatchObject({ contracts: 3, added: 2 });
    expect(f.table.get("TENANT#owner#CONTRACTS", `CONTRACT#${first.contractId}`)).toBeUndefined();
  });
});
