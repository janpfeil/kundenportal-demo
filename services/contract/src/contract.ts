import {
  Cents,
  type ContractSnapshot,
  Division,
  InstallmentAdjusted,
  IsoDate,
  MeterUnit,
} from "@kundenportal/events";
import { z } from "zod";
import { addMonths, earliestTerminationDate } from "./dates.js";
import { isMetered } from "./divisions.js";
import {
  DEFAULT_NOTICE_PERIOD_MONTHS,
  DEFAULT_PRODUCT_IDS,
  type PriceVersion,
  type ProductOption,
} from "./products.js";

export { isMetered } from "./divisions.js";

const Reading = z.object({ value: z.number().nonnegative(), readAt: IsoDate });

/** A pending or effective end of a contract (mirrors `ContractTermination`). */
export const Termination = z.object({
  kind: z.enum(["termination", "withdrawal"]),
  /** Last day of the contract; a withdrawal ends it on the day it is declared. */
  effectiveDate: IsoDate,
  requestedAt: z.iso.datetime({ offset: true }),
  by: z.enum(["customer", "operator"]),
  reason: z.string().optional(),
});
export type Termination = z.infer<typeof Termination>;

/** A contract as the contract domain stores it (without storage keys). */
export const ContractRecord = z.object({
  contractId: z.uuid(),
  customerId: z.string().min(1),
  /** Display name of the customer when the contract was written (operator lists). */
  customerName: z.string().optional(),
  /**
   * Belongs to a throw-away account of the E2E runs (reserved domain `.invalid`); kept out
   * of the operator's lists and figures.
   */
  testAccount: z.boolean().optional(),
  division: Division,
  tariffName: z.string(),
  tariffOption: z.string(),
  /** Product and price version (phase 7); missing on older contracts: default product, v1. */
  productId: z.string().optional(),
  productVersion: z.number().int().positive().optional(),
  monthlyInstallmentCent: Cents,
  installmentMinCent: Cents.optional(),
  installmentMaxCent: Cents.optional(),
  meterNumber: z.string().optional(),
  unit: MeterUnit.optional(),
  estimatedAnnualConsumption: z.number().nonnegative().optional(),
  /** Reference for extrapolating the annual consumption (reading at contract start). */
  startReading: Reading.optional(),
  /** Last reading applied, with the id of its event (idempotency, ordering). */
  lastReading: Reading.extend({ eventId: z.uuid() }).optional(),
  /** Last recalculation, kept to re-publish it if the event is redelivered. */
  lastAdjustment: InstallmentAdjusted.detail.optional(),
  dataVolumeMb: z.number().int().positive().optional(),
  /** Contract number in the legacy system the contract was taken over from. */
  legacyContractId: z.string().optional(),
  startDate: IsoDate,
  minimumTermMonths: z.number().int().nonnegative(),
  /** Missing on contracts from before phase 7: one month. */
  noticePeriodMonths: z.number().int().nonnegative().optional(),
  /** Concluded by the customer in the portal (phase 7): when, and the withdrawal period. */
  orderedAt: z.iso.datetime({ offset: true }).optional(),
  withdrawableUntil: IsoDate.optional(),
  termination: Termination.optional(),
  blocked: z.boolean().optional(),
  /** Stored `terminated` only for legacy contracts and withdrawals; see {@link statusOf}. */
  status: z.enum(["active", "terminated"]),
  version: z.number().int().positive(),
  /** The contract directory has this contract (every save since phase 7 writes both). */
  listed: z.boolean().optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ContractRecord = z.infer<typeof ContractRecord>;

export type ContractStatus = "active" | "terminated";

export const productIdOf = (record: ContractRecord) =>
  record.productId ?? DEFAULT_PRODUCT_IDS[record.division];
export const productVersionOf = (record: ContractRecord) => record.productVersion ?? 1;
export const noticePeriodOf = (record: ContractRecord) =>
  record.noticePeriodMonths ?? DEFAULT_NOTICE_PERIOD_MONTHS;
export const minimumTermEndOf = (record: ContractRecord) =>
  addMonths(record.startDate, record.minimumTermMonths);

/**
 * The status on a German calendar day: `terminated` once the termination's last day has
 * passed, after a withdrawal, or as taken over; a pending termination keeps it `active`.
 * Computed on every read, so no job has to flip it on the effective date.
 */
export function statusOf(record: ContractRecord, today: string): ContractStatus {
  if (record.status === "terminated") return "terminated";
  if (record.termination && record.termination.effectiveDate < today) return "terminated";
  return "active";
}

/** A running contract with a termination that has not taken effect yet. */
export function pendingTermination(record: ContractRecord, today: string): Termination | undefined {
  return statusOf(record, today) === "active" ? record.termination : undefined;
}

export function optionOf(version: PriceVersion, optionId: string): ProductOption | undefined {
  return version.options.find((option) => option.optionId === optionId);
}

/** The contract as the API returns it; mirrors `Contract` in the OpenAPI contract. */
export interface ContractView {
  contractId: string;
  division: Division;
  tariffName: string;
  tariffOption: string;
  tariffOptions: string[];
  monthlyInstallmentCent: number;
  installmentAdjustable: boolean;
  installmentMinCent?: number;
  installmentMaxCent?: number;
  meterNumber?: string;
  unit?: MeterUnit;
  workPriceCent?: number;
  monthlyPriceCent: number;
  estimatedAnnualConsumption?: number;
  dataVolumeMb?: number;
  startDate: string;
  minimumTermMonths: number;
  minimumTermEndDate: string;
  status: ContractStatus;
  updatedAt: string;
  productId: string;
  productVersion: number;
  noticePeriodMonths: number;
  earliestTerminationDate?: string;
  termination?: Termination;
  withdrawableUntil?: string;
  blocked: boolean;
}

const optional = <K extends string, V>(key: K, value: V | undefined) =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

/**
 * The customer's view of a contract; `version` holds the prices of the contract's price
 * version, `today` is the German date the status and the earliest end refer to.
 */
export function toView(record: ContractRecord, version: PriceVersion, today: string): ContractView {
  const option = optionOf(version, record.tariffOption);
  const minimumTermEndDate = minimumTermEndOf(record);
  const status = statusOf(record, today);
  return {
    contractId: record.contractId,
    division: record.division,
    tariffName: record.tariffName,
    tariffOption: record.tariffOption,
    tariffOptions: version.options.map((o) => o.optionId),
    monthlyInstallmentCent: record.monthlyInstallmentCent,
    installmentAdjustable: isMetered(record.division),
    ...optional("installmentMinCent", record.installmentMinCent),
    ...optional("installmentMaxCent", record.installmentMaxCent),
    ...optional("meterNumber", record.meterNumber),
    ...optional("unit", record.unit),
    ...optional("workPriceCent", option?.workPriceCent),
    monthlyPriceCent: option?.monthlyPriceCent ?? 0,
    ...optional("estimatedAnnualConsumption", record.estimatedAnnualConsumption),
    ...optional("dataVolumeMb", record.dataVolumeMb),
    startDate: record.startDate,
    minimumTermMonths: record.minimumTermMonths,
    minimumTermEndDate,
    status,
    updatedAt: record.updatedAt,
    productId: productIdOf(record),
    productVersion: productVersionOf(record),
    noticePeriodMonths: noticePeriodOf(record),
    ...optional(
      "earliestTerminationDate",
      status === "active"
        ? earliestTerminationDate(today, minimumTermEndDate, noticePeriodOf(record))
        : undefined,
    ),
    ...optional("termination", record.termination),
    ...optional("withdrawableUntil", record.withdrawableUntil),
    blocked: record.blocked ?? false,
  };
}

/** What other domains learn about a contract (`ContractChanged`). */
export function toSnapshot(record: ContractRecord, today: string): ContractSnapshot {
  const snapshot: ContractSnapshot = {
    contractId: record.contractId,
    customerId: record.customerId,
    division: record.division,
    tariffName: record.tariffName,
    tariffOption: record.tariffOption,
    monthlyInstallmentCent: record.monthlyInstallmentCent,
    startDate: record.startDate,
    status: statusOf(record, today),
    version: record.version,
    productId: productIdOf(record),
    productVersion: productVersionOf(record),
    blocked: record.blocked ?? false,
  };
  if (record.meterNumber) snapshot.meterNumber = record.meterNumber;
  if (record.unit) snapshot.unit = record.unit;
  if (record.startReading) snapshot.startReading = record.startReading;
  // The consumption domain estimates months without readings from it (phase 6).
  if (record.estimatedAnnualConsumption !== undefined) {
    snapshot.estimatedAnnualConsumption = record.estimatedAnnualConsumption;
  }
  if (record.dataVolumeMb) snapshot.dataVolumeMb = record.dataVolumeMb;
  if (record.termination) {
    const { kind, effectiveDate, requestedAt, by } = record.termination;
    snapshot.termination = { kind, effectiveDate, requestedAt, by };
  }
  return snapshot;
}

/** Editable fields, mirrors `ContractUpdate` in the OpenAPI contract. */
export const ContractUpdate = z
  .strictObject({
    monthlyInstallmentCent: z.number().int().positive().optional(),
    tariffOption: z.string().min(1).max(40).optional(),
  })
  .refine((update) => Object.keys(update).length > 0, "At least one field is required");
export type ContractUpdate = z.infer<typeof ContractUpdate>;
