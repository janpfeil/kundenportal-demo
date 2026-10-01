import { Division, deterministicUuid, type ProductChangedDetail } from "@kundenportal/events";
import { log, notFound } from "@kundenportal/service-kit";
import { type Clock, conflict, systemClock, unprocessable } from "./clock.js";
import { type ContractRecord, productIdOf, productVersionOf } from "./contract.js";
import { today } from "./dates.js";
import { runningByVersion } from "./directory.js";
import type { ProductRepository } from "./product-repository.js";
import {
  currentVersion,
  DEFAULT_PRODUCT_IDS,
  defaultDivisionOf,
  defaultProduct,
  latestVersion,
  operatorProductView,
  optionProblem,
  type PriceVersion,
  type PriceVersionInput,
  type ProductInput,
  type ProductRecord,
  type ProductUpdate,
  type ProductView,
  productView,
  shownVersion,
  STATUS_MOVES,
  staticVersion,
  unitOf,
} from "./products.js";
import type { ContractEvents } from "./publisher.js";
import type { ContractRepository } from "./repository.js";

/** Products already read in one request, by id (`undefined`: not in the catalogue). */
export type ProductCache = Map<string, ProductRecord | undefined>;

const DIVISIONS = Division.options;
const byDivisionAndName = (a: ProductRecord, b: ProductRecord) =>
  DIVISIONS.indexOf(a.division) - DIVISIONS.indexOf(b.division) ||
  a.name.localeCompare(b.name, "de");

/**
 * The tenant's product catalogue: what customers may order, and the operator's product
 * management (create, edit, publish, retire, archive, new price versions). The default
 * catalogue (the demo tariffs) is seeded into a tenant the first time it is read.
 */
export class ProductCatalogue {
  constructor(
    private readonly products: ProductRepository,
    private readonly contracts: ContractRepository,
    private readonly events: ContractEvents,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Every product of the tenant; adds missing default products (conditional puts). */
  async all(tenantId: string): Promise<ProductRecord[]> {
    const stored = await this.products.list(tenantId);
    const ids = new Set(stored.map((p) => p.productId));
    for (const division of DIVISIONS) {
      if (!ids.has(DEFAULT_PRODUCT_IDS[division])) stored.push(await this.seed(tenantId, division));
    }
    return stored.sort(byDivisionAndName);
  }

  /** One product; a default product not seeded yet is seeded now. */
  async find(tenantId: string, productId: string): Promise<ProductRecord | undefined> {
    const stored = await this.products.get(tenantId, productId);
    if (stored) return stored;
    const division = defaultDivisionOf(productId);
    return division ? this.seed(tenantId, division) : undefined;
  }

  private async seed(tenantId: string, division: Division): Promise<ProductRecord> {
    const product = defaultProduct(division, this.clock.now().toISOString());
    if (await this.products.create(tenantId, product)) {
      log("info", "Default product seeded", { tenantId, productId: product.productId });
      return product;
    }
    // Seeded concurrently: the stored one wins.
    return (await this.products.get(tenantId, product.productId)) ?? product;
  }

  /**
   * The price version a contract runs on. Version 1 of a default product needs no read;
   * others are read once per request (`cache`). A version missing from the catalogue
   * (cannot happen, versions are never removed) falls back to the division's defaults.
   */
  async versionFor(
    tenantId: string,
    record: ContractRecord,
    cache: ProductCache = new Map(),
  ): Promise<PriceVersion> {
    const productId = productIdOf(record);
    const number = productVersionOf(record);
    const fixed = staticVersion(productId, number);
    if (fixed) return fixed;
    if (!cache.has(productId)) cache.set(productId, await this.find(tenantId, productId));
    const version = cache.get(productId)?.versions.find((v) => v.version === number);
    if (version) return version;
    log("warn", "Price version of a contract missing", { tenantId, productId, number });
    return staticVersion(DEFAULT_PRODUCT_IDS[record.division], 1) as PriceVersion;
  }

  /** Products a customer may order: `active` and with a version valid today. */
  async orderable(tenantId: string, division?: Division): Promise<ProductView[]> {
    const day = today(this.clock.now());
    return (await this.all(tenantId))
      .filter((p) => p.status === "active" && currentVersion(p, day))
      .filter((p) => !division || p.division === division)
      .map((p) => productView(p, day));
  }

  async listForOperator(tenantId: string): Promise<ProductView[]> {
    const [products, directory] = await Promise.all([
      this.all(tenantId),
      this.contracts.directory(tenantId),
    ]);
    const now = this.clock.now();
    return products.map((p) =>
      operatorProductView(p, today(now), runningByVersion(directory, p.productId, now)),
    );
  }

  async getForOperator(tenantId: string, productId: string): Promise<ProductView> {
    return this.operatorView(tenantId, await this.require(tenantId, productId));
  }

  /** A new product: `draft`, price version 1 from `validFrom` (default today). */
  async create(tenantId: string, input: ProductInput, correlationId: string) {
    const now = this.clock.now();
    const day = today(now);
    const validFrom = input.validFrom ?? day;
    if (validFrom < day) throw unprocessable("Gültig ab darf nicht in der Vergangenheit liegen.");
    const problem = optionProblem(input.division, input.options);
    if (problem) throw unprocessable(problem);
    if (await this.find(tenantId, input.productId)) {
      throw conflict(`Ein Produkt mit der Kennung ${input.productId} gibt es schon.`);
    }
    const at = now.toISOString();
    const product: ProductRecord = {
      productId: input.productId,
      division: input.division,
      name: input.name,
      description: input.description,
      status: "draft",
      minimumTermMonths: input.minimumTermMonths,
      noticePeriodMonths: input.noticePeriodMonths,
      versions: [{ version: 1, validFrom, createdAt: at, options: input.options }],
      createdAt: at,
      updatedAt: at,
      revision: 1,
    };
    const unit = unitOf(input.division);
    if (unit) product.unit = unit;
    if (!(await this.products.create(tenantId, product))) {
      throw conflict(`Ein Produkt mit der Kennung ${input.productId} gibt es schon.`);
    }
    await this.publish(tenantId, product, "created", correlationId);
    return operatorProductView(product, day, {});
  }

  /** Texts, terms or status; terms apply to new orders only (contracts keep theirs). */
  async update(tenantId: string, productId: string, update: ProductUpdate, correlationId: string) {
    const current = await this.require(tenantId, productId);
    if (current.status === "archived") {
      throw conflict("Archivierte Produkte lassen sich nicht mehr ändern.");
    }
    const next: ProductRecord = { ...current };
    if (update.name !== undefined) next.name = update.name;
    if (update.description !== undefined) next.description = update.description;
    if (update.minimumTermMonths !== undefined) next.minimumTermMonths = update.minimumTermMonths;
    if (update.noticePeriodMonths !== undefined)
      next.noticePeriodMonths = update.noticePeriodMonths;
    const directory = await this.contracts.directory(tenantId);
    const now = this.clock.now();
    if (update.status !== undefined && update.status !== current.status) {
      if (!STATUS_MOVES[current.status].includes(update.status)) {
        throw conflict(
          `Ein Produkt im Status ${current.status} kann nicht ${update.status} werden.`,
        );
      }
      const running = Object.values(runningByVersion(directory, productId, now)).reduce(
        (sum, n) => sum + n,
        0,
      );
      if (update.status === "archived" && running > 0) {
        throw conflict(`Mit diesem Produkt laufen noch ${running} Verträge.`);
      }
      next.status = update.status;
    }
    const changed = (
      ["name", "description", "minimumTermMonths", "noticePeriodMonths"] as const
    ).some((field) => next[field] !== current[field]);
    if (!changed && next.status === current.status) {
      return operatorProductView(current, today(now), runningByVersion(directory, productId, now));
    }
    next.revision = current.revision + 1;
    next.updatedAt = now.toISOString();
    if (!(await this.products.replace(tenantId, next, current.revision))) {
      throw conflict("Das Produkt wurde gleichzeitig geändert; bitte neu laden.");
    }
    await this.publish(
      tenantId,
      next,
      next.status !== current.status ? "status" : "updated",
      correlationId,
    );
    return operatorProductView(next, today(now), runningByVersion(directory, productId, now));
  }

  /**
   * New prices from `validFrom` (today or later, not before the latest version) for the
   * same options. New orders get it from that day; running contracts keep their version
   * until the operator applies the new one (`applyPriceVersion`).
   */
  async addVersion(
    tenantId: string,
    productId: string,
    input: PriceVersionInput,
    correlationId: string,
  ) {
    const current = await this.require(tenantId, productId);
    if (current.status === "archived") {
      throw conflict("Archivierte Produkte bekommen keine neuen Preise.");
    }
    const now = this.clock.now();
    const day = today(now);
    const latest = latestVersion(current);
    if (input.validFrom < day) {
      throw unprocessable("Gültig ab darf nicht in der Vergangenheit liegen.");
    }
    if (input.validFrom < latest.validFrom) {
      throw unprocessable(`Gültig ab muss am oder nach dem ${latest.validFrom} liegen.`);
    }
    const known = latest.options.map((o) => o.optionId).sort();
    const given = input.options.map((o) => o.optionId).sort();
    if (known.join("\u0000") !== given.join("\u0000")) {
      throw unprocessable(`Die Preisversion braucht genau die Optionen ${known.join(", ")}.`);
    }
    const problem = optionProblem(current.division, input.options);
    if (problem) throw unprocessable(problem);
    const at = now.toISOString();
    const version: PriceVersion = {
      version: latest.version + 1,
      validFrom: input.validFrom,
      createdAt: at,
      options: input.options,
    };
    const next: ProductRecord = {
      ...current,
      versions: [...current.versions, version],
      revision: current.revision + 1,
      updatedAt: at,
    };
    if (!(await this.products.replace(tenantId, next, current.revision))) {
      throw conflict("Das Produkt wurde gleichzeitig geändert; bitte neu laden.");
    }
    await this.publish(tenantId, next, "priceVersion", correlationId, version.version);
    return this.operatorView(tenantId, next);
  }

  /** A product of the catalogue or 404. */
  async require(tenantId: string, productId: string): Promise<ProductRecord> {
    const product = await this.find(tenantId, productId);
    if (!product) throw notFound("Product not found");
    return product;
  }

  private async operatorView(tenantId: string, product: ProductRecord): Promise<ProductView> {
    const now = this.clock.now();
    const directory = await this.contracts.directory(tenantId);
    return operatorProductView(
      product,
      today(now),
      runningByVersion(directory, product.productId, now),
    );
  }

  private async publish(
    tenantId: string,
    product: ProductRecord,
    change: ProductChangedDetail["payload"]["change"],
    correlationId: string,
    version = shownVersion(product, today(this.clock.now())).version,
  ): Promise<void> {
    await this.events.productChanged({
      eventId: deterministicUuid(tenantId, "product", product.productId, String(product.revision)),
      tenantId,
      occurredAt: product.updatedAt,
      correlationId,
      payload: {
        change,
        product: {
          productId: product.productId,
          division: product.division,
          name: product.name,
          status: product.status,
          version,
        },
      },
    });
    log("info", "Product changed", { tenantId, productId: product.productId, change });
  }
}
