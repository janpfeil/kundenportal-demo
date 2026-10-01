import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ProductChanged } from "@kundenportal/events";
import { beforeEach, describe, expect, it } from "vitest";
import { asCustomer, asOperator, body, fixture, NOW } from "./testing/fixture.js";

const f = fixture();
const api = f.api;

const registered = {
  source: "kundenportal.customer",
  "detail-type": "CustomerRegistered",
  detail: {
    eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
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

const natur = {
  productId: "strom-natur",
  division: "electricity",
  name: "Strom Natur",
  description: "Ökostrom aus der Region.",
  minimumTermMonths: 12,
  noticePeriodMonths: 1,
  options: [
    { optionId: "basis", label: "Basis", monthlyPriceCent: 1000, workPriceCent: 35 },
    { optionId: "plus", label: "Plus", monthlyPriceCent: 1500, workPriceCent: 33.5 },
  ],
};
const create = (input: Record<string, unknown> = natur) =>
  api(asOperator("POST /admin/products", { body: input }));
const patch = (productId: string, update: unknown) =>
  api(
    asOperator("PATCH /admin/products/{productId}", {
      pathParameters: { productId },
      body: update,
    }),
  );
const addVersion = (productId: string, input: unknown) =>
  api(
    asOperator("POST /admin/products/{productId}/versions", {
      pathParameters: { productId },
      body: input,
    }),
  );
const getProduct = (productId: string) =>
  api(asOperator("GET /admin/products/{productId}", { pathParameters: { productId } }));
const orderable = async (division = "electricity") =>
  body(await api(asCustomer("GET /products", { query: { division } }))).items;
const lastProductEvent = () => ProductChanged.detail.parse(f.published().at(-1)?.detail);

beforeEach(async () => {
  f.reset();
  await f.worker(registered);
  f.ebMock.resetHistory();
  f.dbMock.resetHistory();
});

describe("GET /admin/products", () => {
  it("lists every product with all versions and running contracts per version", async () => {
    const result = await api(asOperator("GET /admin/products"));
    expect(result.statusCode).toBe(200);
    const items = body(result).items;
    expect(items.map((p: { productId: string }) => p.productId)).toEqual([
      "strom-klassik",
      "gas-komfort",
      "wasser-basis",
      "internet-zuhause",
      "mobil-flex",
    ]);
    expect(items[0]).toMatchObject({
      status: "active",
      version: 1,
      versions: [expect.objectContaining({ version: 1, validFrom: "2026-01-01" })],
      contractCount: { "1": 1 },
    });
    expect(items[3].contractCount).toEqual({ "1": 0 });
  });

  it("answers 404 for an unknown product and 400 for a malformed id", async () => {
    expect((await getProduct("strom-gold")).statusCode).toBe(404);
    expect((await getProduct("Strom!")).statusCode).toBe(400);
  });
});

describe("POST /admin/products", () => {
  it("creates a draft with price version 1 from today and publishes ProductChanged", async () => {
    const result = await create();
    expect(result.statusCode).toBe(201);
    expect(body(result)).toMatchObject({
      productId: "strom-natur",
      status: "draft",
      unit: "kWh",
      version: 1,
      versions: [{ version: 1, validFrom: "2026-10-02", createdAt: NOW, options: natur.options }],
      contractCount: { "1": 0 },
    });
    expect(lastProductEvent()).toMatchObject({
      tenantId: "owner",
      payload: {
        change: "created",
        product: { productId: "strom-natur", division: "electricity", status: "draft", version: 1 },
      },
    });
    expect(f.table.get("TENANT#owner#PRODUCTS", "PRODUCT#strom-natur")).toMatchObject({
      revision: 1,
    });
    // A draft is not orderable.
    expect((await orderable()).map((p: { productId: string }) => p.productId)).toEqual([
      "strom-klassik",
    ]);
  });

  it.each([
    ["an id that is taken", { ...natur, productId: "strom-klassik" }, 409],
    ["a default product's id before it was seeded", { ...natur, productId: "wasser-basis" }, 409],
    [
      "metered options without work price",
      { ...natur, options: [{ optionId: "a", label: "A", monthlyPriceCent: 1 }] },
      422,
    ],
    ["a validity in the past", { ...natur, validFrom: "2026-10-01" }, 422],
    ["an invalid id", { ...natur, productId: "Strom Natur" }, 400],
    ["no options", { ...natur, options: [] }, 400],
    ["unknown fields", { ...natur, status: "active" }, 400],
  ])("rejects %s", async (_case, input, status) => {
    if (input.productId === "wasser-basis") f.table.items.clear();
    expect((await create(input)).statusCode).toBe(status);
  });
});

describe("PATCH /admin/products/{productId}", () => {
  beforeEach(async () => {
    await create();
    f.ebMock.resetHistory();
  });

  it("publishes a draft, so customers can order it", async () => {
    const result = await patch("strom-natur", { status: "active" });
    expect(body(result).status).toBe("active");
    expect(lastProductEvent().payload).toMatchObject({
      change: "status",
      product: { status: "active" },
    });
    expect((await orderable()).map((p: { productId: string }) => p.productId)).toEqual([
      "strom-klassik",
      "strom-natur",
    ]);
    const order = await api(
      asCustomer("POST /contracts", {
        body: {
          productId: "strom-natur",
          optionId: "plus",
          startDate: "2026-10-02",
          meterNumber: "1EMH77",
          startReading: 1,
          consent: true,
        },
      }),
    );
    expect(order.statusCode).toBe(201);
    // (2800 kWh × 33.5 ct + 12 × 1500 ct) / 12 = 9316.67 ct → 94 €
    expect(body(order)).toMatchObject({
      productId: "strom-natur",
      productVersion: 1,
      monthlyInstallmentCent: 9400,
    });
  });

  it("retires a product: no new orders, running contracts stay; it may come back", async () => {
    const result = await patch("strom-klassik", { status: "retiring" });
    expect(body(result)).toMatchObject({ status: "retiring", contractCount: { "1": 1 } });
    expect(await orderable()).toEqual([]);
    expect((await patch("strom-klassik", { status: "active" })).statusCode).toBe(200);
  });

  it("archives only products without running contracts, and archived ones stay as they are", async () => {
    await patch("strom-klassik", { status: "retiring" });
    const refused = await patch("strom-klassik", { status: "archived" });
    expect(refused.statusCode).toBe(409);
    expect(body(refused).detail).toBe("Mit diesem Produkt laufen noch 1 Verträge.");
    expect((await patch("strom-natur", { status: "archived" })).statusCode).toBe(200);
    expect((await patch("strom-natur", { name: "Strom Natur 2" })).statusCode).toBe(409);
    expect((await patch("strom-natur", { status: "active" })).statusCode).toBe(409);
  });

  it.each([
    ["draft", "retiring"],
    ["active", "archived"],
    ["active", "draft"],
  ])("refuses %s → %s with 409", async (from, to) => {
    if (from === "active") await patch("strom-natur", { status: "active" });
    expect((await patch("strom-natur", { status: to })).statusCode).toBe(409);
  });

  it("edits texts and terms for new orders", async () => {
    const result = await patch("strom-natur", {
      name: "Strom Natur Regional",
      noticePeriodMonths: 3,
    });
    expect(body(result)).toMatchObject({ name: "Strom Natur Regional", noticePeriodMonths: 3 });
    expect(lastProductEvent().payload).toMatchObject({
      change: "updated",
      product: { name: "Strom Natur Regional" },
    });
    expect(f.table.get("TENANT#owner#PRODUCTS", "PRODUCT#strom-natur")).toMatchObject({
      revision: 2,
    });
  });

  it("writes and publishes nothing if nothing changes", async () => {
    f.dbMock.resetHistory();
    expect((await patch("strom-natur", { name: "Strom Natur" })).statusCode).toBe(200);
    expect(f.dbMock.commandCalls(PutCommand)).toHaveLength(0);
    expect(f.published()).toEqual([]);
  });

  it.each([{}, { status: "deleted" }, { prices: 1 }])("rejects %j with 400", async (update) => {
    expect((await patch("strom-natur", update)).statusCode).toBe(400);
  });

  it("answers 404 for unknown products", async () => {
    expect((await patch("strom-gold", { name: "Gold" })).statusCode).toBe(404);
  });
});

describe("POST /admin/products/{productId}/versions", () => {
  const prices = (work: number) => ({
    validFrom: "2026-11-01",
    options: [
      { optionId: "standard", label: "Standard", monthlyPriceCent: 1300, workPriceCent: work },
      { optionId: "oeko", label: "Ökostrom", monthlyPriceCent: 1300, workPriceCent: work + 2 },
    ],
  });

  it("adds prices from a future date; orders get them from that day, contracts keep theirs", async () => {
    const result = await addVersion("strom-klassik", prices(35));
    expect(result.statusCode).toBe(201);
    expect(body(result)).toMatchObject({
      version: 1,
      versions: [
        expect.objectContaining({ version: 2, validFrom: "2026-11-01" }),
        expect.objectContaining({ version: 1 }),
      ],
      contractCount: { "1": 1, "2": 0 },
    });
    expect(lastProductEvent().payload).toMatchObject({
      change: "priceVersion",
      product: { version: 2 },
    });
    expect((await orderable())[0].options[0].workPriceCent).toBe(32);

    f.clock.at = new Date("2026-10-31T23:00:00.000Z"); // 1 November, 00:00 in Germany
    expect((await orderable())[0]).toMatchObject({
      version: 2,
      options: [
        expect.objectContaining({ workPriceCent: 35 }),
        expect.objectContaining({ workPriceCent: 37 }),
      ],
    });
    const order = await api(
      asCustomer("POST /contracts", {
        body: {
          productId: "strom-klassik",
          optionId: "standard",
          startDate: "2026-11-01",
          meterNumber: "1EMH88",
          startReading: 1,
          consent: true,
        },
      }),
    );
    expect(body(order)).toMatchObject({ productVersion: 2, workPriceCent: 35 });
    expect(body(await getProduct("strom-klassik")).contractCount).toEqual({ "1": 1, "2": 1 });
  });

  it.each([
    ["a validity in the past", { ...prices(35), validFrom: "2026-10-01" }, 422],
    ["other option ids", { ...prices(35), options: [prices(35).options[0]] }, 422],
    [
      "options of another division",
      { ...prices(35), options: prices(35).options.map((o) => ({ ...o, dataVolumeMb: 1 })) },
      422,
    ],
    ["a missing date", { options: prices(35).options }, 400],
  ])("rejects %s", async (_case, input, status) => {
    expect((await addVersion("strom-klassik", input)).statusCode).toBe(status);
  });

  it("rejects a version valid before the latest one", async () => {
    await addVersion("strom-klassik", { ...prices(35), validFrom: "2026-12-01" });
    expect((await addVersion("strom-klassik", prices(36))).statusCode).toBe(422);
    expect(
      (await addVersion("strom-klassik", { ...prices(36), validFrom: "2026-12-01" })).statusCode,
    ).toBe(201);
  });

  it("gives archived products no new prices and answers 404 for unknown ones", async () => {
    await create();
    await patch("strom-natur", { status: "archived" });
    expect(
      (await addVersion("strom-natur", { validFrom: "2026-11-01", options: natur.options }))
        .statusCode,
    ).toBe(409);
    expect((await addVersion("strom-gold", prices(35))).statusCode).toBe(404);
  });
});
