import { z } from "zod";
import { EventSource, eventDetailSchema } from "./envelope.js";

/** Lines of business ("Sparten") of the multi-utility provider. */
export const Division = z.enum(["electricity", "gas", "water", "internet", "mobile"]);
export type Division = z.infer<typeof Division>;

/** Divisions whose contracts have a meter the customer reads. */
export const METERED_DIVISIONS: readonly Division[] = ["electricity", "gas", "water"];

export const MeterUnit = z.enum(["kWh", "m3"]);
export type MeterUnit = z.infer<typeof MeterUnit>;

/** A calendar date without time, e.g. `2026-09-30`. */
export const IsoDate = z.iso.date();

/** Amounts of money are integer euro cents throughout the portal. */
export const Cents = z.number().int().nonnegative();

/**
 * The state of a contract as other domains may know it. Contract events carry the
 * whole snapshot (event-carried state transfer), so consumers keep their own
 * projection instead of reading the contract domain's items.
 */
export const ContractSnapshot = z.object({
  contractId: z.uuid(),
  customerId: z.string().min(1),
  division: Division,
  tariffName: z.string().min(1),
  tariffOption: z.string().min(1),
  monthlyInstallmentCent: Cents,
  /** Only for metered divisions. */
  meterNumber: z.string().min(1).optional(),
  unit: MeterUnit.optional(),
  /** Meter reading at the start of the contract (billing reference). */
  startReading: z.object({ value: z.number().nonnegative(), readAt: IsoDate }).optional(),
  /**
   * Only for metered divisions: the contract domain's estimate of the consumption per
   * year in `unit` (typical value at contract start, later extrapolated from readings).
   * Optional, because snapshots published before phase 6 do not carry it.
   */
  estimatedAnnualConsumption: z.number().nonnegative().optional(),
  /** Only for mobile contracts: included data volume per month. */
  dataVolumeMb: z.number().int().positive().optional(),
  startDate: IsoDate,
  status: z.enum(["active", "terminated"]),
  /** Increases with every change; consumers ignore snapshots older than the one they hold. */
  version: z.number().int().positive(),
  /** Product of the catalogue the contract belongs to and its price version (phase 7). */
  productId: z.string().min(1).optional(),
  productVersion: z.number().int().positive().optional(),
  /**
   * A pending or effective end: a termination (`effectiveDate` in the future while
   * pending) or a withdrawal (effective at once). Missing while the contract runs on.
   */
  termination: z
    .object({
      kind: z.enum(["termination", "withdrawal"]),
      effectiveDate: IsoDate,
      requestedAt: z.iso.datetime({ offset: true }),
      by: z.enum(["customer", "operator"]),
    })
    .optional(),
  /** Blocked by the operator: the customer can no longer change it. */
  blocked: z.boolean().optional(),
});
export type ContractSnapshot = z.infer<typeof ContractSnapshot>;

/** Who caused a contract change; missing on the system's own (registration, migration). */
export const ContractInitiator = z.enum(["customer", "operator", "system"]);
export type ContractInitiator = z.infer<typeof ContractInitiator>;

export const ContractChangeField = z.enum([
  "installment",
  "tariffOption",
  // Phase 7: product catalogue, termination, withdrawal and the operator's controls.
  "product",
  "priceVersion",
  "termination",
  "terminationCancelled",
  "withdrawal",
  "blocked",
  "unblocked",
]);
export type ContractChangeField = z.infer<typeof ContractChangeField>;

/**
 * A contract was created (e.g. demo contracts after registration) or changed by the
 * customer (installment within the allowed range, tariff option).
 */
export const ContractChanged = {
  source: EventSource.contract,
  detailType: "ContractChanged",
  detail: eventDetailSchema(
    z.object({
      changeType: z.enum(["created", "updated"]),
      /** What changed; empty for `created`. */
      changes: z.array(ContractChangeField),
      previous: z
        .object({
          monthlyInstallmentCent: Cents,
          tariffOption: z.string().min(1),
          tariffName: z.string().min(1).optional(),
          productId: z.string().min(1).optional(),
          productVersion: z.number().int().positive().optional(),
        })
        .optional(),
      contract: ContractSnapshot,
      /**
       * Who caused it. `created` by the `customer` is an order from the catalogue (the
       * mailbox confirms it); the demo contracts and migrated contracts come from the
       * `system`. Missing on events from before phase 7.
       */
      initiatedBy: ContractInitiator.optional(),
      /** The operator's reason, shown to the customer (no personal data of others). */
      reason: z.string().min(1).max(300).optional(),
    }),
  ),
} as const;
export type ContractChangedDetail = z.infer<typeof ContractChanged.detail>;

export const ProductStatus = z.enum(["draft", "active", "retiring", "archived"]);
export type ProductStatus = z.infer<typeof ProductStatus>;

/**
 * The operator changed the product catalogue: created, edited, published, retired,
 * archived or gave it a new price version. Informative (cockpit timeline); contracts
 * change only through their own `ContractChanged`.
 */
export const ProductChanged = {
  source: EventSource.contract,
  detailType: "ProductChanged",
  detail: eventDetailSchema(
    z.object({
      change: z.enum(["created", "updated", "status", "priceVersion"]),
      product: z.object({
        productId: z.string().min(1),
        division: Division,
        name: z.string().min(1),
        status: ProductStatus,
        version: z.number().int().positive(),
      }),
    }),
  ),
} as const;
export type ProductChangedDetail = z.infer<typeof ProductChanged.detail>;

/** The monthly installment was recalculated after a meter reading. */
export const InstallmentAdjusted = {
  source: EventSource.contract,
  detailType: "InstallmentAdjusted",
  detail: eventDetailSchema(
    z.object({
      customerId: z.string().min(1),
      contractId: z.uuid(),
      division: Division,
      previousInstallmentCent: Cents,
      newInstallmentCent: Cents,
      /** Extrapolated consumption per year the new installment is based on. */
      estimatedAnnualConsumption: z.number().nonnegative(),
      unit: MeterUnit,
      reason: z.literal("meter-reading"),
      /** Event id of the `MeterReadingSubmitted` that caused the adjustment. */
      causationId: z.uuid(),
    }),
  ),
} as const;
export type InstallmentAdjustedDetail = z.infer<typeof InstallmentAdjusted.detail>;
