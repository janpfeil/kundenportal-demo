import { createHash } from "node:crypto";
import {
  Cents,
  type ContractSnapshot,
  Division,
  deterministicUuid,
  InstallmentAdjusted,
  IsoDate,
  type LegacyContract,
  METERED_DIVISIONS,
  MeterUnit,
} from "@kundenportal/events";
import { z } from "zod";
import {
  addDays,
  addMonths,
  annualConsumptionFromInstallment,
  recommendedInstallment,
  TARIFFS,
  tariffOption,
} from "./tariffs.js";

const Reading = z.object({ value: z.number().nonnegative(), readAt: IsoDate });

/** A contract as the contract domain stores it (without storage keys). */
export const ContractRecord = z.object({
  contractId: z.uuid(),
  customerId: z.string().min(1),
  division: Division,
  tariffName: z.string(),
  tariffOption: z.string(),
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
  minimumTermMonths: z.number().int().positive(),
  status: z.enum(["active", "terminated"]),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ContractRecord = z.infer<typeof ContractRecord>;

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
  status: "active" | "terminated";
  updatedAt: string;
}

export function isMetered(division: Division): boolean {
  return METERED_DIVISIONS.includes(division);
}

export function toView(record: ContractRecord): ContractView {
  const option = tariffOption(record.division, record.tariffOption);
  const optional = <K extends string, V>(key: K, value: V | undefined) =>
    value === undefined ? {} : ({ [key]: value } as Record<K, V>);
  return {
    contractId: record.contractId,
    division: record.division,
    tariffName: record.tariffName,
    tariffOption: record.tariffOption,
    tariffOptions: TARIFFS[record.division].options.map((o) => o.id),
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
    minimumTermEndDate: addMonths(record.startDate, record.minimumTermMonths),
    status: record.status,
    updatedAt: record.updatedAt,
  };
}

/** What other domains learn about a contract (`ContractChanged`). */
export function toSnapshot(record: ContractRecord): ContractSnapshot {
  const snapshot: ContractSnapshot = {
    contractId: record.contractId,
    customerId: record.customerId,
    division: record.division,
    tariffName: record.tariffName,
    tariffOption: record.tariffOption,
    monthlyInstallmentCent: record.monthlyInstallmentCent,
    startDate: record.startDate,
    status: record.status,
    version: record.version,
  };
  if (record.meterNumber) snapshot.meterNumber = record.meterNumber;
  if (record.unit) snapshot.unit = record.unit;
  if (record.startReading) snapshot.startReading = record.startReading;
  if (record.dataVolumeMb) snapshot.dataVolumeMb = record.dataVolumeMb;
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

interface DemoContract {
  division: Division;
  option: string;
  /** Metered only: typical annual consumption and the meter at contract start. */
  annualConsumption?: number;
  startReading?: number;
  meterPrefix?: string;
}

/**
 * Demo contracts a newly registered customer receives, so journeys J4–J6 work right
 * after sign-up: electricity and gas with meters, and a mobile contract with a data
 * volume. They start 180 days before registration, so the first reading can already be
 * extrapolated to a year.
 */
export const DEMO_CONTRACTS: DemoContract[] = [
  {
    division: "electricity",
    option: "standard",
    annualConsumption: 2800,
    startReading: 18234,
    meterPrefix: "1EMH",
  },
  {
    division: "gas",
    option: "standard",
    annualConsumption: 1200,
    startReading: 7342,
    meterPrefix: "7GMT",
  },
  { division: "mobile", option: "20gb" },
];
export const DEMO_START_DAYS_BEFORE = 180;

/** Plausible meter number, stable per customer and division (e.g. `1EMH0012345678`). */
function meterNumber(prefix: string, customerId: string, division: Division): string {
  const digest = createHash("sha256").update(`${customerId}:${division}`).digest();
  return `${prefix}00${(digest.readUInt32BE(0) % 100_000_000).toString().padStart(8, "0")}`;
}

/** Builds the demo contracts; ids derive from the triggering event (idempotent). */
export function demoContracts(
  customerId: string,
  eventId: string,
  occurredAt: string,
): ContractRecord[] {
  const startDate = addDays(occurredAt.slice(0, 10), -DEMO_START_DAYS_BEFORE);
  return DEMO_CONTRACTS.map((demo) => {
    const tariff = TARIFFS[demo.division];
    const option = tariffOption(demo.division, demo.option);
    if (!option) throw new Error(`Unknown demo option ${demo.option}`);
    const record: ContractRecord = {
      contractId: deterministicUuid(eventId, demo.division),
      customerId,
      division: demo.division,
      tariffName: tariff.tariffName,
      tariffOption: option.id,
      monthlyInstallmentCent: option.monthlyPriceCent,
      startDate,
      minimumTermMonths: tariff.minimumTermMonths,
      status: "active",
      version: 1,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    if (option.dataVolumeMb) record.dataVolumeMb = option.dataVolumeMb;
    if (tariff.unit && demo.annualConsumption !== undefined && demo.startReading !== undefined) {
      const installment = recommendedInstallment(demo.annualConsumption, option);
      Object.assign(record, {
        unit: tariff.unit,
        meterNumber: meterNumber(demo.meterPrefix ?? "", customerId, demo.division),
        estimatedAnnualConsumption: demo.annualConsumption,
        startReading: { value: demo.startReading, readAt: startDate },
        monthlyInstallmentCent: installment.installmentCent,
        installmentMinCent: installment.minCent,
        installmentMaxCent: installment.maxCent,
      });
    }
    return record;
  });
}

/**
 * Contracts taken over from a legacy system (`LegacyAccountMigrated`, `AccountsLinked`).
 * The installment stays as the legacy system billed it; the allowed range follows the
 * consumption that installment implies. The last billed reading becomes the reference
 * for the next estimate. Ids derive from tenant and legacy contract number (idempotent).
 */
export function legacyContracts(
  tenantId: string,
  customerId: string,
  contracts: LegacyContract[],
  occurredAt: string,
): ContractRecord[] {
  return contracts.map((legacy) => {
    const tariff = TARIFFS[legacy.division];
    const option = tariffOption(legacy.division, legacy.tariffOption) ?? tariff.options[0];
    if (!option) throw new Error(`No tariff options for ${legacy.division}`);
    const record: ContractRecord = {
      contractId: deterministicUuid(tenantId, "legacy-contract", legacy.legacyContractId),
      customerId,
      division: legacy.division,
      tariffName: tariff.tariffName,
      tariffOption: option.id,
      monthlyInstallmentCent: legacy.monthlyInstallmentCent,
      legacyContractId: legacy.legacyContractId,
      startDate: legacy.startDate,
      minimumTermMonths: tariff.minimumTermMonths,
      status: "active",
      version: 1,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    const dataVolumeMb = legacy.dataVolumeMb ?? option.dataVolumeMb;
    if (dataVolumeMb) record.dataVolumeMb = dataVolumeMb;
    if (tariff.unit && isMetered(legacy.division)) {
      const annual = annualConsumptionFromInstallment(legacy.monthlyInstallmentCent, option);
      const range = recommendedInstallment(annual, option);
      Object.assign(record, {
        unit: legacy.unit ?? tariff.unit,
        estimatedAnnualConsumption: annual,
        installmentMinCent: Math.min(range.minCent, legacy.monthlyInstallmentCent),
        installmentMaxCent: Math.max(range.maxCent, legacy.monthlyInstallmentCent),
        ...(legacy.meterNumber ? { meterNumber: legacy.meterNumber } : {}),
        ...(legacy.lastReading ? { startReading: legacy.lastReading } : {}),
      });
    }
    return record;
  });
}
