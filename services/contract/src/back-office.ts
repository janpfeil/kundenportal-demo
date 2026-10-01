import { notFound } from "@kundenportal/service-kit";
import { z } from "zod";
import type { ProductCatalogue } from "./catalogue.js";
import { type Clock, conflict, systemClock, unprocessable } from "./clock.js";
import {
  type ContractRecord,
  type ContractView,
  isMetered,
  pendingTermination,
  productIdOf,
  productVersionOf,
  toView,
} from "./contract.js";
import { today } from "./dates.js";
import { type ContractQuery, contractPage, overview } from "./directory.js";
import { creationEntry, euros, type HistoryEntry } from "./history.js";
import { assertRunning, cancelTermination, onVersion, terminate, withOption } from "./lifecycle.js";
import { currentVersion, type PriceVersion } from "./products.js";
import type { ContractEvents } from "./publisher.js";
import type { ContractRepository } from "./repository.js";
import { ContractWriter } from "./writer.js";

const Reason = z.string().trim().min(3).max(300);

/** Mirrors `ContractAction` in the OpenAPI contract. */
export const ContractAction = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("changeOption"),
    optionId: z.string().min(1).max(40),
    reason: Reason,
  }),
  z.strictObject({
    type: z.literal("changeProduct"),
    productId: z.string().min(1).max(40),
    optionId: z.string().min(1).max(40),
    reason: Reason,
  }),
  z.strictObject({ type: z.literal("applyPriceVersion"), reason: Reason }),
  z.strictObject({
    type: z.literal("setInstallment"),
    monthlyInstallmentCent: z.number().int().min(100),
    reason: Reason,
  }),
  z.strictObject({
    type: z.literal("terminate"),
    effectiveDate: z.iso.date().optional(),
    reason: Reason,
  }),
  z.strictObject({ type: z.literal("cancelTermination"), reason: Reason }),
  z.strictObject({ type: z.literal("block"), reason: Reason }),
  z.strictObject({ type: z.literal("unblock"), reason: Reason }),
]);
export type ContractAction = z.infer<typeof ContractAction>;

/** `OperatorContract`: the contract with whom it belongs to. */
export type OperatorContractView = ContractView & { customerId: string; customerName?: string };

/**
 * The operator's back office for contracts (`/admin/…`): key figures, the directory with
 * filters and pages, one contract with its history, and the controls. Callers have passed
 * `operatorFrom` and act only in their token's tenant.
 */
export class BackOffice {
  private readonly writer: ContractWriter;

  constructor(
    private readonly repository: ContractRepository,
    events: ContractEvents,
    private readonly catalogue: ProductCatalogue,
    private readonly clock: Clock = systemClock,
  ) {
    this.writer = new ContractWriter(repository, events, clock);
  }

  async overview(tenantId: string) {
    return overview(await this.repository.directory(tenantId), this.clock.now());
  }

  async contracts(tenantId: string, query: ContractQuery) {
    return contractPage(await this.repository.directory(tenantId), query, this.clock.now());
  }

  async contract(tenantId: string, contractId: string) {
    const record = await this.load(tenantId, contractId);
    const history = await this.repository.history(tenantId, record.customerId, contractId);
    return {
      contract: await this.view(tenantId, record),
      history: [...history, creationEntry(record)] satisfies HistoryEntry[],
    };
  }

  /** Carries out an operator action; every action needs a reason and is kept in history. */
  async act(
    tenantId: string,
    contractId: string,
    action: ContractAction,
    correlationId: string,
  ): Promise<OperatorContractView> {
    const current = await this.load(tenantId, contractId);
    const now = this.clock.now();
    const before = await this.catalogue.versionFor(tenantId, current);
    let after: PriceVersion = before;
    let next: ContractRecord;
    if (action.type !== "unblock") assertRunning(current, now);
    switch (action.type) {
      case "changeOption":
        if (action.optionId === current.tariffOption) {
          throw conflict("Der Vertrag hat diese Option bereits.");
        }
        next = withOption(current, before, action.optionId);
        break;
      case "changeProduct": {
        if (action.productId === productIdOf(current)) {
          throw conflict("Der Vertrag hat dieses Produkt bereits; bitte die Option wechseln.");
        }
        const product = await this.catalogue.find(tenantId, action.productId);
        if (!product) throw unprocessable(`Das Produkt ${action.productId} gibt es nicht.`);
        if (product.division !== current.division) {
          throw unprocessable("Das Produkt gehört zu einer anderen Sparte.");
        }
        if (product.status === "archived") throw conflict("Das Produkt ist archiviert.");
        const version = currentVersion(product, today(now));
        if (!version) throw conflict("Das Produkt hat noch keine gültige Preisversion.");
        next = onVersion(current, product, version, action.optionId);
        after = version;
        break;
      }
      case "applyPriceVersion": {
        const product = await this.catalogue.require(tenantId, productIdOf(current));
        const version = currentVersion(product, today(now));
        if (!version || version.version <= productVersionOf(current)) {
          throw conflict("Der Vertrag hat bereits die aktuelle Preisversion.");
        }
        next = onVersion(current, product, version, current.tariffOption);
        after = version;
        break;
      }
      case "setInstallment":
        next = setInstallment(current, action.monthlyInstallmentCent);
        break;
      case "terminate":
        next = terminate(current, {
          effectiveDate: action.effectiveDate,
          by: "operator",
          reason: action.reason,
          now,
        });
        if (
          next.termination?.effectiveDate === pendingTermination(current, today(now))?.effectiveDate
        ) {
          throw conflict("Der Vertrag ist bereits zu diesem Datum gekündigt.");
        }
        break;
      case "cancelTermination":
        next = cancelTermination(current, "operator", now);
        break;
      case "block":
        if (current.blocked) throw conflict("Der Vertrag ist bereits gesperrt.");
        next = { ...current, blocked: true };
        break;
      case "unblock": {
        if (!current.blocked) throw conflict("Der Vertrag ist nicht gesperrt.");
        const { blocked: _blocked, ...rest } = current;
        next = rest;
        break;
      }
    }
    const saved = await this.writer.change(tenantId, current, next, {
      by: "operator",
      reason: action.reason,
      correlationId,
      versions: { before, after },
    });
    if (!saved) throw conflict("Der Vertrag wurde gleichzeitig geändert; bitte neu laden.");
    if (saved === current) throw conflict("Die Aktion ändert nichts am Vertrag.");
    return this.view(tenantId, saved);
  }

  private async view(tenantId: string, record: ContractRecord): Promise<OperatorContractView> {
    const version = await this.catalogue.versionFor(tenantId, record);
    return {
      ...toView(record, version, today(this.clock.now())),
      customerId: record.customerId,
      ...(record.customerName ? { customerName: record.customerName } : {}),
    };
  }

  /** A contract of the tenant, found through the directory (no scan); 404 otherwise. */
  private async load(tenantId: string, contractId: string): Promise<ContractRecord> {
    const entry = await this.repository.directoryEntry(tenantId, contractId);
    const record =
      entry && (await this.repository.get(tenantId, entry.customerId, entry.division, contractId));
    if (!record) throw notFound("Contract not found");
    return record;
  }
}

/**
 * The operator sets the installment of a metered contract in whole euros, also outside
 * the customer's range (which then widens to include it); telco prices follow the option.
 */
function setInstallment(record: ContractRecord, amount: number): ContractRecord {
  if (!isMetered(record.division)) {
    throw unprocessable("Der Monatspreis dieses Vertrags folgt der Option.");
  }
  if (amount % 100 !== 0) throw unprocessable("Der Abschlag muss in ganzen Euro angegeben sein.");
  if (amount === record.monthlyInstallmentCent) {
    throw conflict(`Der Abschlag beträgt bereits ${euros(amount)}.`);
  }
  return {
    ...record,
    monthlyInstallmentCent: amount,
    installmentMinCent: Math.min(record.installmentMinCent ?? amount, amount),
    installmentMaxCent: Math.max(record.installmentMaxCent ?? amount, amount),
  };
}
