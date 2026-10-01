import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { PutCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ContractChanged } from "@kundenportal/events";
import { beforeEach, describe, expect, it } from "vitest";
import type { ContractRecord } from "./contract.js";
import { demoContracts } from "./origins.js";
import { asCustomer, body, contractItem, fixture, linkItem } from "./testing/fixture.js";

const f = fixture();
const api = f.api;

const [electricity, gas, mobile] = demoContracts(
  "c-1",
  "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  "2026-09-30T12:00:00.000Z",
);
if (!electricity || !gas || !mobile) throw new Error("demo contracts missing");
const listed = (record: ContractRecord): ContractRecord => ({ ...record, listed: true });

/** A contract as stored before phase 7: no product, no notice period, no directory entry. */
function beforePhase7(record: ContractRecord): ContractRecord {
  const {
    productId: _p,
    productVersion: _v,
    noticePeriodMonths: _n,
    customerName: _c,
    ...old
  } = record;
  return old;
}

const patch = (contractId: string, payload: unknown) =>
  api(
    asCustomer("PATCH /contracts/{contractId}", { pathParameters: { contractId }, body: payload }),
  );
const contractPk = "TENANT#owner#CUST#c-1";

beforeEach(() => {
  f.reset();
  f.table.put(linkItem(), ...[electricity, gas, mobile].map((c) => contractItem(listed(c))));
});

describe("GET /contracts", () => {
  it("lists the caller's contracts without storage keys", async () => {
    const result = await api(asCustomer("GET /contracts"));

    expect(result.statusCode).toBe(200);
    const list = body(result).items;
    expect(list.map((c: { division: string }) => c.division)).toEqual([
      "electricity",
      "gas",
      "mobile",
    ]);
    expect(list[0]).toMatchObject({
      contractId: electricity.contractId,
      tariffName: "Strom Klassik",
      tariffOptions: ["standard", "oeko"],
      monthlyInstallmentCent: 8700,
      installmentAdjustable: true,
      installmentMinCent: 6900,
      installmentMaxCent: 13100,
      workPriceCent: 32,
      minimumTermEndDate: "2027-04-03",
      productId: "strom-klassik",
      productVersion: 1,
      noticePeriodMonths: 1,
      earliestTerminationDate: "2027-04-03",
      blocked: false,
      status: "active",
    });
    expect(list[2]).toMatchObject({ installmentAdjustable: false, dataVolumeMb: 20480 });
    for (const key of ["PK", "SK", "customerId", "version", "startReading", "listed"])
      expect(list[0]).not.toHaveProperty(key);
  });

  it("needs no catalogue read or write for contracts on a default product's first version", async () => {
    await api(asCustomer("GET /contracts"));
    expect(f.writes().filter((w) => w !== "GetCommand" && w !== "QueryCommand")).toEqual([]);
  });

  it("returns an empty list before CustomerRegistered reached the contract domain", async () => {
    const result = await api(asCustomer("GET /contracts", { claims: { sub: "sub-new" } }));
    expect(body(result)).toEqual({ items: [] });
  });

  it("scopes the lookup to the caller's tenant", async () => {
    const result = await api(asCustomer("GET /contracts", { claims: { tenant_id: "other" } }));
    expect(body(result)).toEqual({ items: [] });
  });
});

describe("contracts from before phase 7", () => {
  beforeEach(() => {
    f.table.put(contractItem(beforePhase7(electricity)));
  });

  it("are read as the division's default product, version 1, with one month notice", async () => {
    const result = await api(
      asCustomer("GET /contracts/{contractId}", {
        pathParameters: { contractId: electricity.contractId },
      }),
    );
    expect(body(result)).toMatchObject({
      productId: "strom-klassik",
      productVersion: 1,
      noticePeriodMonths: 1,
      tariffOptions: ["standard", "oeko"],
    });
  });

  it("join the contract directory when the customer next reads them (once)", async () => {
    await api(asCustomer("GET /contracts"));
    expect(
      f.table.get("TENANT#owner#CONTRACTS", `CONTRACT#${electricity.contractId}`),
    ).toMatchObject({
      customerId: "c-1",
      customerName: "Anna Muster",
      productId: "strom-klassik",
      productVersion: 1,
      status: "active",
    });
    expect(f.table.get(contractPk, `CONTRACT#electricity#${electricity.contractId}`)).toMatchObject(
      { listed: true, version: 1, customerName: "Anna Muster" },
    );
    expect(f.dbMock.commandCalls(PutCommand)).toHaveLength(1);
    expect(f.dbMock.commandCalls(UpdateCommand)).toHaveLength(1);

    await api(asCustomer("GET /contracts"));
    expect(f.dbMock.commandCalls(PutCommand)).toHaveLength(1);
  });

  it("can be changed; the change event names the default product", async () => {
    await patch(electricity.contractId, { monthlyInstallmentCent: 9000 });
    const detail = ContractChanged.detail.parse(f.published()[0]?.detail);
    expect(detail.payload.contract).toMatchObject({
      productId: "strom-klassik",
      productVersion: 1,
    });
    expect(detail.payload.previous).toMatchObject({
      productId: "strom-klassik",
      productVersion: 1,
    });
  });
});

describe("GET /contracts/{contractId}", () => {
  const get = (contractId: string) =>
    api(asCustomer("GET /contracts/{contractId}", { pathParameters: { contractId } }));

  it("returns one contract of the caller", async () => {
    const result = await get(gas.contractId);
    expect(result.statusCode).toBe(200);
    expect(body(result)).toMatchObject({ division: "gas", unit: "m3" });
  });

  it("answers 404 for contracts of other customers and 400 for malformed ids", async () => {
    f.table.put(
      contractItem({
        ...listed(gas),
        customerId: "c-2",
        contractId: "0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
      }),
    );
    expect((await get("0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b")).statusCode).toBe(404);
    expect((await get("../x")).statusCode).toBe(400);
  });
});

describe("PATCH /contracts/{contractId}", () => {
  it("sets the installment, keeps history and directory in one transaction, publishes ContractChanged", async () => {
    const result = await patch(electricity.contractId, { monthlyInstallmentCent: 10000 });

    expect(result.statusCode).toBe(200);
    expect(body(result)).toMatchObject({ monthlyInstallmentCent: 10000 });
    const items = f.dbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
    expect(items?.map((i) => i.Put?.Item?.SK)).toEqual([
      `CONTRACT#electricity#${electricity.contractId}`,
      `CONTRACT#${electricity.contractId}`,
      `HISTORY#${electricity.contractId}#000002`,
    ]);
    expect(items?.[0]?.Put?.ExpressionAttributeValues).toEqual({ ":expected": 1 });
    expect(f.table.get(contractPk, `HISTORY#${electricity.contractId}#000002`)).toMatchObject({
      change: "installment",
      by: "customer",
      summary: "Abschlag 87 € → 100 €",
    });

    const entry = f.ebMock.commandCalls(PutEventsCommand)[0]?.args[0].input.Entries?.[0];
    expect(entry).toMatchObject({
      EventBusName: "bus",
      Source: "kundenportal.contract",
      DetailType: "ContractChanged",
    });
    const detail = ContractChanged.detail.parse(JSON.parse(entry?.Detail ?? "{}"));
    expect(detail).toMatchObject({
      tenantId: "owner",
      correlationId: "req-1",
      payload: {
        changeType: "updated",
        changes: ["installment"],
        initiatedBy: "customer",
        previous: { monthlyInstallmentCent: 8700, tariffOption: "standard" },
        contract: {
          contractId: electricity.contractId,
          monthlyInstallmentCent: 10000,
          estimatedAnnualConsumption: 2800,
          version: 2,
          blocked: false,
        },
      },
    });
  });

  it("changes the mobile option together with price and data volume", async () => {
    const result = await patch(mobile.contractId, { tariffOption: "40gb" });
    expect(body(result)).toMatchObject({
      tariffOption: "40gb",
      monthlyInstallmentCent: 2999,
      dataVolumeMb: 40960,
    });
    const detail = f.published()[0]?.detail;
    expect(detail.payload.changes).toEqual(["installment", "tariffOption"]);
    expect(f.table.get(contractPk, `HISTORY#${mobile.contractId}#000002`)).toMatchObject({
      change: "tariffOption",
      summary: "Monatspreis 19,99 € → 29,99 € · Option 20 GB → 40 GB",
    });
  });

  it("moves the range with a new option of a metered contract", async () => {
    const result = await patch(electricity.contractId, { tariffOption: "oeko" });
    expect(body(result)).toMatchObject({ tariffOption: "oeko", workPriceCent: 34 });
  });

  it("does nothing and publishes nothing if the values do not change", async () => {
    const result = await patch(electricity.contractId, { monthlyInstallmentCent: 8700 });
    expect(result.statusCode).toBe(200);
    expect(f.dbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    expect(f.published()).toHaveLength(0);
  });

  it.each([
    ["below the range", electricity.contractId, { monthlyInstallmentCent: 5000 }],
    ["above the range", electricity.contractId, { monthlyInstallmentCent: 20000 }],
    ["not whole euros", electricity.contractId, { monthlyInstallmentCent: 9050 }],
    ["a fixed telco price", mobile.contractId, { monthlyInstallmentCent: 2000 }],
    ["an unknown option", gas.contractId, { tariffOption: "gold" }],
  ])("rejects %s with 422", async (_case, contractId, payload) => {
    const result = await patch(contractId, payload);
    expect(result.statusCode).toBe(422);
    expect(result.headers?.["content-type"]).toBe("application/problem+json");
    expect(f.dbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it.each([{}, { monthlyInstallmentCent: "90" }, { status: "terminated" }])(
    "rejects %j with 400",
    async (payload) => {
      expect((await patch(electricity.contractId, payload)).statusCode).toBe(400);
    },
  );

  it("answers 409 if the contract changed concurrently", async () => {
    f.dbMock.on(TransactWriteCommand).rejects(
      new TransactionCanceledException({
        message: "cancelled",
        $metadata: {},
        CancellationReasons: [{ Code: "ConditionalCheckFailed" }, { Code: "None" }],
      }),
    );
    const result = await patch(electricity.contractId, { monthlyInstallmentCent: 9000 });
    expect(result.statusCode).toBe(409);
    expect(f.published()).toHaveLength(0);
  });

  it("answers 500 without details when EventBridge rejects the event", async () => {
    f.ebMock
      .on(PutEventsCommand)
      .resolves({ FailedEntryCount: 1, Entries: [{ ErrorCode: "InternalFailure" }] });
    const result = await patch(electricity.contractId, { monthlyInstallmentCent: 9000 });
    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain("InternalFailure");
  });
});

describe("GET /products", () => {
  it("seeds the default catalogue once and lists the active products of a division", async () => {
    const result = await api(asCustomer("GET /products", { query: { division: "internet" } }));
    expect(result.statusCode).toBe(200);
    expect(body(result).items).toEqual([
      expect.objectContaining({
        productId: "internet-zuhause",
        status: "active",
        version: 1,
        noticePeriodMonths: 1,
        minimumTermMonths: 24,
        options: [
          { optionId: "100", label: "100 Mbit/s", monthlyPriceCent: 3499, bandwidthMbit: 100 },
          { optionId: "250", label: "250 Mbit/s", monthlyPriceCent: 4499, bandwidthMbit: 250 },
          { optionId: "1000", label: "1 Gbit/s", monthlyPriceCent: 6999, bandwidthMbit: 1000 },
        ],
      }),
    ]);
    expect(body(result).items[0]).not.toHaveProperty("versions");
    expect(f.table.partition("TENANT#owner#PRODUCTS")).toHaveLength(5);
    expect(f.dbMock.commandCalls(PutCommand)).toHaveLength(5);

    await api(asCustomer("GET /products"));
    expect(f.dbMock.commandCalls(PutCommand)).toHaveLength(5);
  });

  it("rejects an unknown division with 400", async () => {
    const result = await api(asCustomer("GET /products", { query: { division: "heat" } }));
    expect(result.statusCode).toBe(400);
  });
});
