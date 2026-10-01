import { deterministicUuid, type Division } from "@kundenportal/events";
import { type Caller, notFound } from "@kundenportal/service-kit";
import type { ProductCache, ProductCatalogue } from "./catalogue.js";
import { type Clock, conflict, systemClock, unprocessable } from "./clock.js";
import {
  type ContractRecord,
  type ContractUpdate,
  type ContractView,
  isMetered,
  toView,
} from "./contract.js";
import { addDays, today } from "./dates.js";
import {
  assertCustomerMayChange,
  cancelTermination,
  terminate,
  withdraw,
  withOption,
} from "./lifecycle.js";
import { type ContractOrder, MAX_START_DAYS_AHEAD, orderedContract } from "./origins.js";
import { currentVersion } from "./products.js";
import type { ContractEvents } from "./publisher.js";
import type { ContractRepository, CustomerLink } from "./repository.js";
import { ContractWriter } from "./writer.js";

export type { Clock } from "./clock.js";

const euros = (cents: number) => (cents / 100).toFixed(2);
const concurrent = () => conflict("The contract was changed concurrently; reload it");

/**
 * The customer's use cases of the contract domain (`/contracts`, `/products`),
 * independent of Lambda, HTTP and EventBridge: list and change own contracts, order a
 * product, give and take back notice, withdraw.
 */
export class ContractService {
  private readonly writer: ContractWriter;

  constructor(
    private readonly repository: ContractRepository,
    events: ContractEvents,
    private readonly catalogue: ProductCatalogue,
    private readonly clock: Clock = systemClock,
  ) {
    this.writer = new ContractWriter(repository, events, clock);
  }

  async list(caller: Caller): Promise<ContractView[]> {
    const link = await this.repository.customerOf(caller.tenantId, caller.subject);
    if (!link) return [];
    const records = await this.records(caller.tenantId, link);
    const cache: ProductCache = new Map();
    const views: ContractView[] = [];
    for (const record of records) views.push(await this.view(caller.tenantId, record, cache));
    return views;
  }

  async get(caller: Caller, contractId: string): Promise<ContractView> {
    return this.view(caller.tenantId, await this.load(caller, contractId));
  }

  /** Orderable products (`GET /products`). */
  async products(caller: Caller, division?: Division) {
    return this.catalogue.orderable(caller.tenantId, division);
  }

  /**
   * Changes the tariff option and/or the monthly installment. The installment of a
   * metered contract may be set in whole euros within the allowed range; a new tariff
   * option moves that range and keeps the installment inside it. Telco contracts have a
   * fixed monthly price that follows the option.
   */
  async update(
    caller: Caller,
    contractId: string,
    update: ContractUpdate,
    correlationId: string,
  ): Promise<ContractView> {
    const current = await this.load(caller, contractId);
    assertCustomerMayChange(current, this.clock.now());
    const version = await this.catalogue.versionFor(caller.tenantId, current);
    let next: ContractRecord = { ...current };
    if (update.tariffOption !== undefined && update.tariffOption !== current.tariffOption) {
      next = withOption(current, version, update.tariffOption);
    }
    if (update.monthlyInstallmentCent !== undefined) {
      if (!isMetered(current.division)) {
        throw unprocessable("The monthly price of this contract is fixed");
      }
      const amount = update.monthlyInstallmentCent;
      const min = next.installmentMinCent ?? 0;
      const max = next.installmentMaxCent ?? Number.MAX_SAFE_INTEGER;
      if (amount % 100 !== 0) throw unprocessable("The installment must be whole euros");
      if (amount < min || amount > max) {
        throw unprocessable(`The installment must be between ${euros(min)} and ${euros(max)} EUR`);
      }
      next.monthlyInstallmentCent = amount;
    }
    if (
      next.monthlyInstallmentCent === current.monthlyInstallmentCent &&
      next.tariffOption === current.tariffOption
    ) {
      return this.view(caller.tenantId, current);
    }
    return this.commit(caller, current, next, correlationId, { before: version, after: version });
  }

  /**
   * Concludes a contract for an active product (`POST /contracts`): the option of the
   * product's current price version, a start within the next 90 days, meter number and
   * start reading for metered divisions. Publishes `ContractChanged` (`created`, by the
   * customer); the consumption domain takes the start reading from the snapshot.
   */
  async order(caller: Caller, order: ContractOrder, correlationId: string): Promise<ContractView> {
    const link = await this.repository.customerOf(caller.tenantId, caller.subject);
    if (!link) {
      throw conflict(
        "Ihr Kundenkonto wird noch eingerichtet. Bitte versuchen Sie es gleich noch einmal.",
      );
    }
    const product = await this.catalogue.find(caller.tenantId, order.productId);
    if (!product || product.status === "draft") throw notFound("Product not found");
    const now = this.clock.now();
    const day = today(now);
    const version = currentVersion(product, day);
    if (product.status !== "active" || !version) {
      throw unprocessable(`${product.name} ist nicht bestellbar.`);
    }
    const option = version.options.find((o) => o.optionId === order.optionId);
    if (!option) throw unprocessable(`${product.name} hat keine Option ${order.optionId}.`);
    const latestStart = addDays(day, MAX_START_DAYS_AHEAD);
    if (order.startDate < day || order.startDate > latestStart) {
      throw unprocessable(
        `Der Vertrag kann zwischen heute und ${MAX_START_DAYS_AHEAD} Tagen beginnen.`,
      );
    }
    const metered = isMetered(product.division);
    if (metered && (!order.meterNumber || order.startReading === undefined)) {
      throw unprocessable("Für diesen Vertrag braucht es Zählernummer und Zählerstand zu Beginn.");
    }
    if (!metered && (order.meterNumber !== undefined || order.startReading !== undefined)) {
      throw unprocessable("Zählernummer und Zählerstand gibt es nur bei Strom, Gas und Wasser.");
    }
    const record = orderedContract({
      contractId: deterministicUuid(caller.tenantId, link.customerId, correlationId, "order"),
      customerId: link.customerId,
      customerName: link.customerName ?? caller.name,
      ...(link.testAccount ? { testAccount: true } : {}),
      product,
      version,
      option,
      order,
      now,
    });
    await this.writer.create(
      caller.tenantId,
      [{ record, eventId: deterministicUuid(record.contractId, "created") }],
      { by: "customer", correlationId, occurredAt: record.createdAt },
    );
    return toView(record, version, day);
  }

  /** Gives notice to the earliest end or a later chosen date. */
  async terminate(
    caller: Caller,
    contractId: string,
    effectiveDate: string | undefined,
    correlationId: string,
  ): Promise<ContractView> {
    const current = await this.load(caller, contractId);
    const now = this.clock.now();
    assertCustomerMayChange(current, now);
    const next = terminate(current, { effectiveDate, by: "customer", now });
    return this.commit(caller, current, next, correlationId);
  }

  async cancelTermination(
    caller: Caller,
    contractId: string,
    correlationId: string,
  ): Promise<ContractView> {
    const current = await this.load(caller, contractId);
    const now = this.clock.now();
    assertCustomerMayChange(current, now);
    return this.commit(caller, current, cancelTermination(current, "customer", now), correlationId);
  }

  async withdraw(caller: Caller, contractId: string, correlationId: string) {
    const current = await this.load(caller, contractId);
    const now = this.clock.now();
    assertCustomerMayChange(current, now);
    return this.commit(caller, current, withdraw(current, now), correlationId);
  }

  private async commit(
    caller: Caller,
    current: ContractRecord,
    next: ContractRecord,
    correlationId: string,
    versions?: Parameters<ContractWriter["change"]>[3]["versions"],
  ): Promise<ContractView> {
    const saved = await this.writer.change(caller.tenantId, current, next, {
      by: "customer",
      correlationId,
      ...(versions ? { versions } : {}),
    });
    if (!saved) throw concurrent();
    return this.view(caller.tenantId, saved);
  }

  private async view(tenantId: string, record: ContractRecord, cache?: ProductCache) {
    const version = await this.catalogue.versionFor(tenantId, record, cache);
    return toView(record, version, today(this.clock.now()));
  }

  /**
   * The customer's contracts; contracts saved before phase 7 are added to the contract
   * directory on the way (once each).
   */
  private async records(tenantId: string, link: CustomerLink): Promise<ContractRecord[]> {
    const records = await this.repository.list(tenantId, link.customerId);
    const result: ContractRecord[] = [];
    for (const record of records) {
      result.push(
        record.listed
          ? record
          : await this.repository.backfill(tenantId, record, link.customerName),
      );
    }
    return result;
  }

  private async load(caller: Caller, contractId: string): Promise<ContractRecord> {
    const link = await this.repository.customerOf(caller.tenantId, caller.subject);
    const record = link
      ? (await this.records(caller.tenantId, link)).find((c) => c.contractId === contractId)
      : undefined;
    if (!record) throw notFound("Contract not found");
    return record;
  }
}
