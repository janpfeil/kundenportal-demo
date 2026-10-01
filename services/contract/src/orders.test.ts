import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ContractChanged } from "@kundenportal/events";
import { beforeEach, describe, expect, it } from "vitest";
import type { ContractRecord } from "./contract.js";
import { demoContracts } from "./origins.js";
import { defaultProduct } from "./products.js";
import { asCustomer, body, contractItem, fixture, linkItem, NOW } from "./testing/fixture.js";

const f = fixture();
const api = f.api;

const order = (payload: Record<string, unknown>) =>
  api(asCustomer("POST /contracts", { body: { consent: true, ...payload } }));
const terminate = (contractId: string, payload?: unknown) =>
  api(
    asCustomer("POST /contracts/{contractId}/termination", {
      pathParameters: { contractId },
      ...(payload === undefined ? {} : { body: payload }),
    }),
  );
const cancel = (contractId: string) =>
  api(asCustomer("DELETE /contracts/{contractId}/termination", { pathParameters: { contractId } }));
const withdraw = (contractId: string) =>
  api(asCustomer("POST /contracts/{contractId}/withdrawal", { pathParameters: { contractId } }));
const get = (contractId: string) =>
  api(asCustomer("GET /contracts/{contractId}", { pathParameters: { contractId } }));
const lastEvent = () => ContractChanged.detail.parse(f.published().at(-1)?.detail);
const history = (contractId: string) =>
  f.table.partition("TENANT#owner#CUST#c-1", `HISTORY#${contractId}#`);

const power = {
  productId: "strom-klassik",
  optionId: "oeko",
  startDate: "2026-10-15",
  meterNumber: "1EMH0099887766",
  startReading: 4711,
};
const phone = { productId: "mobil-flex", optionId: "10gb", startDate: "2026-10-02" };

/** A demo contract from April 2026 and a legacy one from 2019, both without phase 7 terms. */
const [demo] = demoContracts(
  "c-1",
  "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  "2026-09-30T12:00:00.000Z",
);
if (!demo) throw new Error("demo contract missing");
const legacy: ContractRecord = {
  ...demo,
  contractId: "1a5c27a0-5b0f-4b7e-9d0a-2f1e3c4d5e6f",
  startDate: "2019-04-01",
  legacyContractId: "SV-1",
};

beforeEach(() => {
  f.reset();
  f.table.put(linkItem(), contractItem({ ...demo, listed: true }), contractItem(legacy));
});

describe("POST /contracts", () => {
  it("concludes a metered contract with the product's terms and a typical installment", async () => {
    const result = await order(power);

    expect(result.statusCode).toBe(201);
    const contract = body(result);
    expect(contract).toMatchObject({
      division: "electricity",
      productId: "strom-klassik",
      productVersion: 1,
      tariffName: "Strom Klassik",
      tariffOption: "oeko",
      // (2800 kWh × 34 ct + 12 × 1200 ct) / 12 = 9133 ct → 92 €
      monthlyInstallmentCent: 9200,
      installmentMinCent: 7300,
      installmentMaxCent: 13800,
      meterNumber: "1EMH0099887766",
      unit: "kWh",
      startDate: "2026-10-15",
      minimumTermMonths: 12,
      minimumTermEndDate: "2027-10-15",
      noticePeriodMonths: 1,
      earliestTerminationDate: "2027-10-15",
      withdrawableUntil: "2026-10-16",
      status: "active",
      blocked: false,
    });
    const stored = f.table.get(
      "TENANT#owner#CUST#c-1",
      `CONTRACT#electricity#${contract.contractId}`,
    );
    expect(stored).toMatchObject({
      orderedAt: NOW,
      customerName: "Anna Muster",
      startReading: { value: 4711, readAt: "2026-10-15" },
      estimatedAnnualConsumption: 2800,
      listed: true,
      version: 1,
    });
    expect(f.table.get("TENANT#owner#CONTRACTS", `CONTRACT#${contract.contractId}`)).toMatchObject({
      orderedAt: NOW,
      customerId: "c-1",
    });
    const event = lastEvent();
    expect(event.payload).toMatchObject({
      changeType: "created",
      changes: [],
      initiatedBy: "customer",
      contract: { startReading: { value: 4711, readAt: "2026-10-15" }, productId: "strom-klassik" },
    });
    // One transaction: contract and directory entry.
    const writes = f.dbMock.commandCalls(TransactWriteCommand);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.args[0].input.TransactItems).toHaveLength(2);
  });

  it("concludes a telco contract at the option's monthly price", async () => {
    const result = await order(phone);
    expect(body(result)).toMatchObject({
      monthlyInstallmentCent: 1499,
      dataVolumeMb: 10240,
      installmentAdjustable: false,
      minimumTermEndDate: "2028-10-02",
    });
    expect(body(result)).not.toHaveProperty("meterNumber");
  });

  it.each([
    ["an unknown product", { ...phone, productId: "mobil-gold" }, 404],
    ["a start in the past", { ...phone, startDate: "2026-10-01" }, 422],
    ["a start more than 90 days ahead", { ...phone, startDate: "2027-01-01" }, 422],
    ["an unknown option", { ...phone, optionId: "100gb" }, 422],
    ["a metered order without meter", { ...power, meterNumber: undefined }, 422],
    ["a metered order without start reading", { ...power, startReading: undefined }, 422],
    ["a meter on a telco order", { ...phone, meterNumber: "1234567" }, 422],
    ["missing consent", { ...phone, consent: false }, 400],
    ["unknown fields", { ...phone, price: 1 }, 400],
  ])("rejects %s", async (_case, payload, status) => {
    const result = await order(payload);
    expect(result.statusCode).toBe(status);
    expect(f.dbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it("accepts a start exactly 90 days ahead", async () => {
    expect((await order({ ...phone, startDate: "2026-12-31" })).statusCode).toBe(201);
  });

  it("orders only active products", async () => {
    const product = (status: string) => ({
      PK: "TENANT#owner#PRODUCTS",
      SK: "PRODUCT#mobil-flex",
      ...defaultProduct("mobile", NOW),
      status,
    });
    f.table.put(product("draft"));
    expect((await order(phone)).statusCode).toBe(404);
    f.table.put(product("retiring"));
    const retiring = await order(phone);
    expect(retiring.statusCode).toBe(422);
    expect(body(retiring).detail).toBe("Mobil Flex ist nicht bestellbar.");
  });

  it("asks to wait while the customer's account is not set up yet", async () => {
    const result = await api(
      asCustomer("POST /contracts", {
        body: { consent: true, ...phone },
        claims: { sub: "sub-new" },
      }),
    );
    expect(result.statusCode).toBe(409);
  });
});

describe("termination", () => {
  it("ends at the end of the minimum term by default; the contract stays active until then", async () => {
    const result = await terminate(demo.contractId);
    expect(result.statusCode).toBe(200);
    expect(body(result)).toMatchObject({
      status: "active",
      termination: {
        kind: "termination",
        effectiveDate: "2027-04-03",
        requestedAt: NOW,
        by: "customer",
      },
    });
    expect(lastEvent().payload).toMatchObject({
      changes: ["termination"],
      initiatedBy: "customer",
      contract: { status: "active", termination: { effectiveDate: "2027-04-03" }, version: 2 },
    });
    expect(history(demo.contractId)).toEqual([
      expect.objectContaining({
        change: "termination",
        by: "customer",
        summary: "Kündigung zum 03.04.2027",
      }),
    ]);
  });

  it("after the minimum term ends with the notice period at the end of a month", async () => {
    const result = await terminate(legacy.contractId);
    expect(body(result).termination.effectiveDate).toBe("2026-11-30");
    expect(body(await get(legacy.contractId)).earliestTerminationDate).toBe("2026-11-30");
  });

  it("accepts a later date and rejects an earlier one with 422", async () => {
    const early = await terminate(legacy.contractId, { effectiveDate: "2026-11-29" });
    expect(early.statusCode).toBe(422);
    expect(body(early).detail).toBe("Der Vertrag kann frühestens zum 30.11.2026 gekündigt werden.");
    const later = await terminate(legacy.contractId, { effectiveDate: "2027-03-15" });
    expect(body(later).termination.effectiveDate).toBe("2027-03-15");
  });

  it("rejects a second notice with 409 and malformed dates with 400", async () => {
    await terminate(legacy.contractId);
    expect((await terminate(legacy.contractId)).statusCode).toBe(409);
    expect((await terminate(demo.contractId, { effectiveDate: "31.12.2026" })).statusCode).toBe(
      400,
    );
  });

  it("is terminated the day after the effective date, and nothing can be changed then", async () => {
    await terminate(legacy.contractId);
    f.clock.at = new Date("2026-11-30T22:59:00.000Z"); // 30 November, 23:59 in Germany
    expect(body(await get(legacy.contractId)).status).toBe("active");
    f.clock.at = new Date("2026-11-30T23:00:00.000Z"); // 1 December, 00:00
    const ended = body(await get(legacy.contractId));
    expect(ended.status).toBe("terminated");
    expect(ended).not.toHaveProperty("earliestTerminationDate");
    expect((await cancel(legacy.contractId)).statusCode).toBe(409);
    const patch = await api(
      asCustomer("PATCH /contracts/{contractId}", {
        pathParameters: { contractId: legacy.contractId },
        body: { monthlyInstallmentCent: 9000 },
      }),
    );
    expect(patch.statusCode).toBe(409);
  });

  it("can be taken back until the effective date", async () => {
    await terminate(legacy.contractId);
    f.clock.at = new Date("2026-11-30T12:00:00.000Z");
    const result = await cancel(legacy.contractId);
    expect(result.statusCode).toBe(200);
    expect(body(result)).not.toHaveProperty("termination");
    expect(lastEvent().payload).toMatchObject({
      changes: ["terminationCancelled"],
      initiatedBy: "customer",
    });
    expect(lastEvent().payload.contract).not.toHaveProperty("termination");
    expect(history(legacy.contractId).at(-1)).toMatchObject({
      change: "terminationCancelled",
      summary: "Kündigung zum 30.11.2026 zurückgenommen",
    });
    expect((await cancel(legacy.contractId)).statusCode).toBe(409);
  });

  it("cannot take back a termination the operator recorded", async () => {
    f.table.put(
      contractItem({
        ...legacy,
        termination: {
          kind: "termination",
          effectiveDate: "2026-10-31",
          requestedAt: NOW,
          by: "operator",
          reason: "Umzug",
        },
      }),
    );
    const result = await cancel(legacy.contractId);
    expect(result.statusCode).toBe(409);
    expect(body(result).detail).toContain("Anbieter");
  });
});

describe("withdrawal", () => {
  it("ends a contract ordered in the portal at once, within 14 days", async () => {
    const { contractId } = body(await order(power));
    f.clock.at = new Date("2026-10-16T21:59:00.000Z"); // 16 October, 23:59 in Germany
    const result = await withdraw(contractId);
    expect(result.statusCode).toBe(200);
    expect(body(result)).toMatchObject({
      status: "terminated",
      termination: { kind: "withdrawal", effectiveDate: "2026-10-16", by: "customer" },
    });
    expect(lastEvent().payload).toMatchObject({
      changes: ["withdrawal"],
      initiatedBy: "customer",
      contract: { status: "terminated" },
    });
    expect((await withdraw(contractId)).statusCode).toBe(409);
  });

  it("is too late from the 15th day on (German date)", async () => {
    const { contractId } = body(await order(power));
    f.clock.at = new Date("2026-10-16T22:00:00.000Z"); // 17 October, 00:00 in Germany
    const result = await withdraw(contractId);
    expect(result.statusCode).toBe(409);
    expect(body(result).detail).toBe("Die Widerrufsfrist ist am 16.10.2026 abgelaufen.");
  });

  it("replaces a pending termination", async () => {
    const { contractId } = body(await order(phone));
    await terminate(contractId);
    const result = await withdraw(contractId);
    expect(body(result).termination.kind).toBe("withdrawal");
  });

  it("is not possible for contracts not concluded in the portal", async () => {
    expect((await withdraw(demo.contractId)).statusCode).toBe(409);
  });
});

describe("blocked contracts", () => {
  beforeEach(() => {
    f.table.put(contractItem({ ...demo, listed: true, blocked: true }));
  });

  it.each([
    [
      "change",
      () =>
        api(
          asCustomer("PATCH /contracts/{contractId}", {
            pathParameters: { contractId: demo.contractId },
            body: { monthlyInstallmentCent: 9000 },
          }),
        ),
    ],
    ["terminate", () => terminate(demo.contractId)],
    ["take back a termination", () => cancel(demo.contractId)],
    ["withdraw", () => withdraw(demo.contractId)],
  ])("cannot %s (409 with a German detail)", async (_case, call) => {
    const result = await call();
    expect(result.statusCode).toBe(409);
    expect(body(result).detail).toBe(
      "Der Vertrag ist gesperrt. Änderungen sind nur über den Kundenservice möglich.",
    );
    expect(f.published()).toEqual([]);
  });

  it("shows the block to the customer", async () => {
    expect(body(await get(demo.contractId)).blocked).toBe(true);
  });
});

describe("foreign contracts", () => {
  it("answer 404 for every change", async () => {
    const foreign = {
      ...demo,
      customerId: "c-2",
      contractId: "9c7e1f0a-2b3c-4d5e-8f90-a1b2c3d4e5f6",
    };
    f.table.put(contractItem(foreign));
    for (const call of [terminate, cancel, withdraw]) {
      expect((await call(foreign.contractId)).statusCode).toBe(404);
    }
  });
});
