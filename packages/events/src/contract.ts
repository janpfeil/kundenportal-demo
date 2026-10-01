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
});
export type ContractSnapshot = z.infer<typeof ContractSnapshot>;

export const ContractChangeField = z.enum(["installment", "tariffOption"]);
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
        .object({ monthlyInstallmentCent: Cents, tariffOption: z.string().min(1) })
        .optional(),
      contract: ContractSnapshot,
    }),
  ),
} as const;
export type ContractChangedDetail = z.infer<typeof ContractChanged.detail>;

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
