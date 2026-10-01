import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ContractChanged } from "@kundenportal/events";
import { beforeEach, describe, expect, it } from "vitest";
import { demoContracts } from "./origins.js";
import { defaultProduct } from "./products.js";
import { asCustomer, asOperator, body, fixture, NOW } from "./testing/fixture.js";

const f = fixture();
const api = f.api;

const registrationId = "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11";
const registered = {
  source: "kundenportal.customer",
  "detail-type": "CustomerRegistered",
  detail: {
    eventId: registrationId,
    tenantId: "owner",
    occurredAt: "2026-09-30T12:00:00.000Z",
    correlationId: "req-0",
    payload: {
      customerId: "c-1",
      subject: "sub-1",
      email: "anna@example.org",
      displayName: "Anna Muster",
      locale: "de",
      origin: "registration",
    },
  },
};
const [electricity, gas, mobile] = demoContracts("c-1", registrationId, "2026-09-30T12:00:00.000Z");
if (!electricity || !gas || !mobile) throw new Error("demo contracts missing");

const act = (contractId: string, action: Record<string, unknown>, claims = {}) =>
  api(
    asOperator("POST /admin/contracts/{contractId}/actions", {
      pathParameters: { contractId },
      body: { reason: "Kulanz nach Rückfrage", ...action },
      claims,
    }),
  );
const detail = (contractId: string, claims = {}) =>
  api(asOperator("GET /admin/contracts/{contractId}", { pathParameters: { contractId }, claims }));
const lastEvent = () => ContractChanged.detail.parse(f.published().at(-1)?.detail);
const product = (fields: Record<string, unknown>) => ({
  PK: "TENANT#owner#PRODUCTS",
  SK: `PRODUCT#${String(fields.productId)}`,
  ...defaultProduct("electricity", NOW),
  ...fields,
});

beforeEach(async () => {
  f.reset();
  await f.worker(registered);
  f.ebMock.resetHistory();
  f.dbMock.resetHistory();
});

describe("access", () => {
  const routes: [string, Record<string, string>?][] = [
    ["GET /admin/overview"],
    ["GET /admin/contracts"],
    ["GET /admin/contracts/{contractId}", { contractId: electricity.contractId }],
    ["POST /admin/contracts/{contractId}/actions", { contractId: electricity.contractId }],
    ["GET /admin/products"],
    ["POST /admin/products"],
    ["GET /admin/products/{productId}", { productId: "strom-klassik" }],
    ["PATCH /admin/products/{productId}", { productId: "strom-klassik" }],
    ["POST /admin/products/{productId}/versions", { productId: "strom-klassik" }],
  ];

  it.each(routes)("%s answers 403 to customers", async (routeKey, pathParameters) => {
    const result = await api(
      asCustomer(routeKey, {
        ...(pathParameters ? { pathParameters } : {}),
        body: { type: "block", reason: "Test" },
      }),
    );
    expect(result.statusCode).toBe(403);
    expect(f.dbMock.calls()).toHaveLength(0);
  });

  it("answers 403 to a pass holder outside a pass tenant", async () => {
    const result = await api(
      asCustomer("GET /admin/overview", { claims: { "cognito:groups": "[pass]" } }),
    );
    expect(result.statusCode).toBe(403);
  });

  it("finds no contract of another tenant (404)", async () => {
    expect((await detail(electricity.contractId, { tenant_id: "other" })).statusCode).toBe(404);
    expect(
      (await act(electricity.contractId, { type: "block" }, { tenant_id: "other" })).statusCode,
    ).toBe(404);
  });
});

describe("GET /admin/overview", () => {
  it("counts the tenant's contracts and the last seven days' orders and terminations", async () => {
    await api(
      asCustomer("POST /contracts", {
        body: { productId: "mobil-flex", optionId: "40gb", startDate: "2026-10-02", consent: true },
      }),
    );
    await api(
      asCustomer("POST /contracts/{contractId}/termination", {
        pathParameters: { contractId: gas.contractId },
      }),
    );
    await act(mobile.contractId, { type: "terminate", effectiveDate: "2026-10-20" });

    const result = await api(asOperator("GET /admin/overview"));
    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({
      contracts: { active: 2, pendingTermination: 2, terminated: 0, blocked: 0 },
      byDivision: { electricity: 1, gas: 1, water: 0, internet: 0, mobile: 2 },
      days: [
        "2026-09-26",
        "2026-09-27",
        "2026-09-28",
        "2026-09-29",
        "2026-09-30",
        "2026-10-01",
        "2026-10-02",
      ],
      orders: [0, 0, 0, 0, 0, 0, 1],
      terminations: [0, 0, 0, 0, 0, 0, 2],
      endingSoon: 1,
    });
  });
});

describe("GET /admin/contracts", () => {
  const list = (query: Record<string, string> = {}) =>
    api(asOperator("GET /admin/contracts", { query }));

  it("lists the directory with customer, product and computed status", async () => {
    const result = body(await list());
    expect(result.total).toBe(3);
    expect(result.items[0]).toMatchObject({
      customerId: "c-1",
      customerName: "Anna Muster",
      productVersion: 1,
      status: "active",
    });
  });

  it("filters, pages and rejects invalid queries", async () => {
    await act(gas.contractId, { type: "block" });
    expect(
      body(await list({ status: "blocked" })).items.map(
        (i: { contractId: string }) => i.contractId,
      ),
    ).toEqual([gas.contractId]);
    expect(body(await list({ productId: "mobil-flex" })).total).toBe(1);
    const first = body(await list({ limit: "2", sort: "startDate", order: "asc" }));
    expect(first.items).toHaveLength(2);
    const second = body(
      await list({ limit: "2", sort: "startDate", order: "asc", cursor: first.nextCursor }),
    );
    expect(second.items).toHaveLength(1);
    expect((await list({ limit: "500" })).statusCode).toBe(400);
    expect((await list({ cursor: "x" })).statusCode).toBe(400);
  });
});

describe("GET /admin/contracts/{contractId}", () => {
  it("shows the contract with its owner and a history that starts with the creation", async () => {
    const result = await detail(electricity.contractId);
    expect(result.statusCode).toBe(200);
    expect(body(result)).toEqual({
      contract: expect.objectContaining({
        contractId: electricity.contractId,
        customerId: "c-1",
        customerName: "Anna Muster",
        productId: "strom-klassik",
      }),
      history: [
        {
          at: "2026-09-30T12:00:00.000Z",
          change: "created",
          by: "system",
          summary: "Demo-Vertrag, Beginn 03.04.2026",
        },
      ],
    });
  });

  it("lists every change newest first", async () => {
    await act(electricity.contractId, { type: "setInstallment", monthlyInstallmentCent: 9500 });
    f.clock.at = new Date("2026-10-02T11:00:00.000Z");
    await act(electricity.contractId, { type: "block", reason: "Zahlungsverzug" });
    const { history } = body(await detail(electricity.contractId));
    expect(history.map((h: { change: string }) => h.change)).toEqual([
      "blocked",
      "installment",
      "created",
    ]);
    expect(history[0]).toEqual({
      at: "2026-10-02T11:00:00.000Z",
      change: "blocked",
      by: "operator",
      reason: "Zahlungsverzug",
      summary: "Vertrag gesperrt",
    });
    expect(history[1]).toMatchObject({
      summary: "Abschlag 87 € → 95 €",
      reason: "Kulanz nach Rückfrage",
    });
  });

  it("answers 404 for unknown contracts and 400 for malformed ids", async () => {
    expect((await detail("0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b")).statusCode).toBe(404);
    expect((await detail("x")).statusCode).toBe(400);
  });
});

describe("POST /admin/contracts/{contractId}/actions", () => {
  it("changes the option, writes one transaction and tells the customer why", async () => {
    const result = await act(electricity.contractId, { type: "changeOption", optionId: "oeko" });
    expect(result.statusCode).toBe(200);
    expect(body(result)).toMatchObject({
      tariffOption: "oeko",
      customerId: "c-1",
      monthlyInstallmentCent: 8700,
    });
    expect(lastEvent().payload).toMatchObject({
      changes: ["tariffOption"],
      initiatedBy: "operator",
      reason: "Kulanz nach Rückfrage",
      contract: { tariffOption: "oeko", version: 2 },
    });
    expect(
      f.dbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems,
    ).toHaveLength(3);
    expect(body(await detail(electricity.contractId)).history[0].summary).toBe(
      "Option Standard → Ökostrom",
    );
  });

  it("rejects the same or an unknown option", async () => {
    expect(
      (await act(electricity.contractId, { type: "changeOption", optionId: "standard" }))
        .statusCode,
    ).toBe(409);
    expect(
      (await act(electricity.contractId, { type: "changeOption", optionId: "gold" })).statusCode,
    ).toBe(422);
  });

  it("moves a contract to another product of the division at its prices", async () => {
    f.table.put(
      product({
        productId: "strom-natur",
        name: "Strom Natur",
        versions: [
          {
            version: 1,
            validFrom: "2026-01-01",
            createdAt: NOW,
            options: [
              { optionId: "natur", label: "Natur", monthlyPriceCent: 1000, workPriceCent: 36 },
            ],
          },
        ],
      }),
    );
    const result = await act(electricity.contractId, {
      type: "changeProduct",
      productId: "strom-natur",
      optionId: "natur",
    });
    // (2800 kWh × 36 ct + 12 × 1000 ct) / 12 = 9400 ct
    expect(body(result)).toMatchObject({
      productId: "strom-natur",
      productVersion: 1,
      tariffName: "Strom Natur",
      tariffOption: "natur",
      tariffOptions: ["natur"],
      monthlyInstallmentCent: 9400,
      workPriceCent: 36,
    });
    expect(lastEvent().payload).toMatchObject({
      changes: ["installment", "tariffOption", "product"],
      previous: { productId: "strom-klassik", productVersion: 1, tariffName: "Strom Klassik" },
    });
    expect(body(await detail(electricity.contractId)).history[0]).toMatchObject({
      change: "product",
      summary:
        "Abschlag 87 € → 94 € · Option Standard → Natur · Produkt Strom Klassik → Strom Natur",
    });
  });

  it.each([
    ["the same product", { productId: "strom-klassik", optionId: "oeko" }, 409],
    ["an unknown product", { productId: "strom-gold", optionId: "gold" }, 422],
    ["a product of another division", { productId: "gas-komfort", optionId: "standard" }, 422],
    ["an archived product", { productId: "strom-alt", optionId: "standard" }, 409],
    ["a product without valid prices", { productId: "strom-neu", optionId: "standard" }, 409],
    ["an unknown option", { productId: "strom-neu-heute", optionId: "gold" }, 422],
  ])("rejects a change to %s", async (_case, target, status) => {
    f.table.put(
      product({ productId: "strom-alt", status: "archived" }),
      product({
        productId: "strom-neu",
        status: "draft",
        versions: [{ ...defaultProduct("electricity", NOW).versions[0], validFrom: "2026-11-01" }],
      }),
      product({ productId: "strom-neu-heute", status: "draft" }),
    );
    expect(
      (await act(electricity.contractId, { type: "changeProduct", ...target })).statusCode,
    ).toBe(status);
  });

  it("applies the product's current price version", async () => {
    const v1 = defaultProduct("electricity", NOW).versions[0];
    if (!v1) throw new Error("version");
    const v2 = {
      ...v1,
      version: 2,
      validFrom: "2026-10-02",
      options: v1.options.map((o) => ({ ...o, workPriceCent: 36 })),
    };
    f.table.put(product({ productId: "strom-klassik", versions: [v1, v2] }));
    const result = await act(electricity.contractId, { type: "applyPriceVersion" });
    expect(body(result)).toMatchObject({
      productVersion: 2,
      workPriceCent: 36,
      monthlyInstallmentCent: 9600,
    });
    expect(lastEvent().payload.changes).toEqual(["installment", "priceVersion"]);
    expect(body(await detail(electricity.contractId)).history[0].summary).toBe(
      "Abschlag 87 € → 96 € · Preisversion 1 → 2",
    );
    expect((await act(electricity.contractId, { type: "applyPriceVersion" })).statusCode).toBe(409);
  });

  it("does not apply a price version before it is valid", async () => {
    const v1 = defaultProduct("electricity", NOW).versions[0];
    if (!v1) throw new Error("version");
    f.table.put(
      product({
        productId: "strom-klassik",
        versions: [v1, { ...v1, version: 2, validFrom: "2026-10-03" }],
      }),
    );
    expect((await act(electricity.contractId, { type: "applyPriceVersion" })).statusCode).toBe(409);
  });

  it("sets the installment in whole euros, also outside the customer's range", async () => {
    const result = await act(electricity.contractId, {
      type: "setInstallment",
      monthlyInstallmentCent: 20000,
    });
    expect(body(result)).toMatchObject({
      monthlyInstallmentCent: 20000,
      installmentMaxCent: 20000,
      installmentMinCent: 6900,
    });
    expect(
      (await act(electricity.contractId, { type: "setInstallment", monthlyInstallmentCent: 20000 }))
        .statusCode,
    ).toBe(409);
    expect(
      (await act(electricity.contractId, { type: "setInstallment", monthlyInstallmentCent: 9050 }))
        .statusCode,
    ).toBe(422);
    expect(
      (await act(electricity.contractId, { type: "setInstallment", monthlyInstallmentCent: 50 }))
        .statusCode,
    ).toBe(400);
    expect(
      (await act(mobile.contractId, { type: "setInstallment", monthlyInstallmentCent: 1000 }))
        .statusCode,
    ).toBe(422);
  });

  it("terminates earlier than the customer could, with the reason, and replaces a pending notice", async () => {
    await api(
      asCustomer("POST /contracts/{contractId}/termination", {
        pathParameters: { contractId: electricity.contractId },
      }),
    );
    const result = await act(electricity.contractId, {
      type: "terminate",
      effectiveDate: "2026-10-31",
      reason: "Umzug ins Ausland",
    });
    expect(body(result)).toMatchObject({
      status: "active",
      termination: {
        kind: "termination",
        effectiveDate: "2026-10-31",
        by: "operator",
        reason: "Umzug ins Ausland",
      },
    });
    expect(lastEvent().payload).toMatchObject({
      changes: ["termination"],
      reason: "Umzug ins Ausland",
    });
    expect(body(await detail(electricity.contractId)).history[0].summary).toBe(
      "Kündigung zum 31.10.2026 (statt zum 03.04.2027)",
    );
    expect(
      (await act(electricity.contractId, { type: "terminate", effectiveDate: "2026-10-31" }))
        .statusCode,
    ).toBe(409);
    expect(
      (await act(electricity.contractId, { type: "terminate", effectiveDate: "2026-10-01" }))
        .statusCode,
    ).toBe(422);
  });

  it("terminates to the earliest date without a date, and takes a termination back", async () => {
    const result = await act(gas.contractId, { type: "terminate" });
    expect(body(result).termination.effectiveDate).toBe("2027-04-03");
    const back = await act(gas.contractId, { type: "cancelTermination" });
    expect(back.statusCode).toBe(200);
    expect(body(back)).not.toHaveProperty("termination");
    expect(lastEvent().payload).toMatchObject({
      changes: ["terminationCancelled"],
      initiatedBy: "operator",
    });
    expect((await act(gas.contractId, { type: "cancelTermination" })).statusCode).toBe(409);
  });

  it("blocks and unblocks", async () => {
    const blocked = await act(gas.contractId, { type: "block" });
    expect(body(blocked).blocked).toBe(true);
    expect(lastEvent().payload).toMatchObject({
      changes: ["blocked"],
      contract: { blocked: true },
    });
    expect((await act(gas.contractId, { type: "block" })).statusCode).toBe(409);
    // The operator still controls a blocked contract.
    expect(
      (await act(gas.contractId, { type: "changeOption", optionId: "klima" })).statusCode,
    ).toBe(200);
    const unblocked = await act(gas.contractId, { type: "unblock" });
    expect(body(unblocked).blocked).toBe(false);
    expect(lastEvent().payload).toMatchObject({
      changes: ["unblocked"],
      contract: { blocked: false },
    });
    expect((await act(gas.contractId, { type: "unblock" })).statusCode).toBe(409);
  });

  it("allows only unblocking once a contract has ended", async () => {
    await act(mobile.contractId, { type: "block" });
    await act(mobile.contractId, { type: "terminate", effectiveDate: "2026-10-02" });
    f.clock.at = new Date("2026-10-03T10:00:00.000Z");
    for (const action of [
      { type: "changeOption", optionId: "40gb" },
      { type: "terminate" },
      { type: "cancelTermination" },
    ]) {
      expect((await act(mobile.contractId, action)).statusCode).toBe(409);
    }
    expect((await act(mobile.contractId, { type: "unblock" })).statusCode).toBe(200);
  });

  it.each([
    ["without reason", { type: "block", reason: undefined }],
    ["with a too short reason", { type: "block", reason: "x" }],
    ["of an unknown type", { type: "delete" }],
    ["with fields of another type", { type: "block", optionId: "oeko" }],
  ])("rejects an action %s with 400", async (_case, action) => {
    expect((await act(electricity.contractId, action)).statusCode).toBe(400);
  });
});
