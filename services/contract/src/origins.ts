import { createHash } from "node:crypto";
import {
  type Division,
  deterministicUuid,
  IsoDate,
  type LegacyContract,
} from "@kundenportal/events";
import { z } from "zod";
import type { ContractRecord } from "./contract.js";
import { addDays, today } from "./dates.js";
import { isMetered } from "./divisions.js";
import {
  DEFAULT_NOTICE_PERIOD_MONTHS,
  DEFAULT_PRODUCT_IDS,
  type PriceVersion,
  ProductId,
  type ProductOption,
  type ProductRecord,
} from "./products.js";
import {
  annualConsumptionFromInstallment,
  DEFAULT_ANNUAL_CONSUMPTION,
  recommendedInstallment,
  TARIFFS,
  tariffOption,
} from "./tariffs.js";

/** Where contracts come from: demo contracts, legacy take-over and orders in the portal. */

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

/** Days in which a contract concluded in the portal can be withdrawn. */
export const WITHDRAWAL_DAYS = 14;
/** How far ahead an order may start. */
export const MAX_START_DAYS_AHEAD = 90;

/** Plausible meter number, stable per customer and division (e.g. `1EMH0012345678`). */
function meterNumber(prefix: string, customerId: string, division: Division): string {
  const digest = createHash("sha256").update(`${customerId}:${division}`).digest();
  return `${prefix}00${(digest.readUInt32BE(0) % 100_000_000).toString().padStart(8, "0")}`;
}

/** Fields every contract of a division's default product carries (price version 1). */
function defaultProductFields(division: Division) {
  return {
    tariffName: TARIFFS[division].tariffName,
    productId: DEFAULT_PRODUCT_IDS[division],
    productVersion: 1,
    minimumTermMonths: TARIFFS[division].minimumTermMonths,
    noticePeriodMonths: DEFAULT_NOTICE_PERIOD_MONTHS,
  };
}

const withName = (customerName: string | undefined) => (customerName ? { customerName } : {});

/** Builds the demo contracts; ids derive from the triggering event (idempotent). */
export function demoContracts(
  customerId: string,
  eventId: string,
  occurredAt: string,
  customerName?: string,
): ContractRecord[] {
  const startDate = addDays(occurredAt.slice(0, 10), -DEMO_START_DAYS_BEFORE);
  return DEMO_CONTRACTS.map((demo) => {
    const tariff = TARIFFS[demo.division];
    const option = tariffOption(demo.division, demo.option);
    if (!option) throw new Error(`Unknown demo option ${demo.option}`);
    const record: ContractRecord = {
      contractId: deterministicUuid(eventId, demo.division),
      customerId,
      ...withName(customerName),
      division: demo.division,
      ...defaultProductFields(demo.division),
      tariffOption: option.id,
      monthlyInstallmentCent: option.monthlyPriceCent,
      startDate,
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
 * They belong to the division's default product, price version 1. The installment stays
 * as the legacy system billed it; the allowed range follows the consumption that
 * installment implies. The last billed reading becomes the reference for the next
 * estimate. Ids derive from tenant and legacy contract number (idempotent).
 */
export function legacyContracts(
  tenantId: string,
  customerId: string,
  contracts: LegacyContract[],
  occurredAt: string,
  customerName?: string,
): ContractRecord[] {
  return contracts.map((legacy) => {
    const tariff = TARIFFS[legacy.division];
    const option = tariffOption(legacy.division, legacy.tariffOption) ?? tariff.options[0];
    if (!option) throw new Error(`No tariff options for ${legacy.division}`);
    const record: ContractRecord = {
      contractId: deterministicUuid(tenantId, "legacy-contract", legacy.legacyContractId),
      customerId,
      ...withName(customerName),
      division: legacy.division,
      ...defaultProductFields(legacy.division),
      tariffOption: option.id,
      monthlyInstallmentCent: legacy.monthlyInstallmentCent,
      legacyContractId: legacy.legacyContractId,
      startDate: legacy.startDate,
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

/** Mirrors `ContractOrder` in the OpenAPI contract. */
export const ContractOrder = z.strictObject({
  productId: ProductId,
  optionId: z.string().min(1).max(40),
  startDate: IsoDate,
  meterNumber: z.string().trim().min(4).max(30).optional(),
  startReading: z.number().min(0).max(1_000_000_000).optional(),
  consent: z.literal(true),
});
export type ContractOrder = z.infer<typeof ContractOrder>;

/**
 * Installment fields of a contract on an option: metered divisions get the recommended
 * installment for the consumption and its allowed range, telco the option's price.
 */
export function pricing(
  division: Division,
  option: ProductOption,
  annualConsumption: number | undefined,
): Pick<
  ContractRecord,
  "monthlyInstallmentCent" | "installmentMinCent" | "installmentMaxCent" | "dataVolumeMb"
> {
  if (isMetered(division)) {
    const range = recommendedInstallment(annualConsumption ?? 0, option);
    return {
      monthlyInstallmentCent: range.installmentCent,
      installmentMinCent: range.minCent,
      installmentMaxCent: range.maxCent,
    };
  }
  return {
    monthlyInstallmentCent: option.monthlyPriceCent,
    ...(option.dataVolumeMb ? { dataVolumeMb: option.dataVolumeMb } : {}),
  };
}

/**
 * A contract the customer concluded in the portal: terms from the product, prices from
 * its current version, the installment for a typical consumption, withdrawable for
 * {@link WITHDRAWAL_DAYS} days from the German order date.
 */
export function orderedContract(input: {
  contractId: string;
  customerId: string;
  customerName?: string | undefined;
  testAccount?: boolean | undefined;
  product: ProductRecord;
  version: PriceVersion;
  option: ProductOption;
  order: ContractOrder;
  now: Date;
}): ContractRecord {
  const { product, version, option, order, now } = input;
  const at = now.toISOString();
  const annual = DEFAULT_ANNUAL_CONSUMPTION[product.division];
  const record: ContractRecord = {
    contractId: input.contractId,
    customerId: input.customerId,
    ...withName(input.customerName),
    ...(input.testAccount ? { testAccount: true } : {}),
    division: product.division,
    tariffName: product.name,
    tariffOption: option.optionId,
    productId: product.productId,
    productVersion: version.version,
    ...pricing(product.division, option, annual),
    startDate: order.startDate,
    minimumTermMonths: product.minimumTermMonths,
    noticePeriodMonths: product.noticePeriodMonths,
    orderedAt: at,
    withdrawableUntil: addDays(today(now), WITHDRAWAL_DAYS),
    status: "active",
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
  if (isMetered(product.division) && order.meterNumber && order.startReading !== undefined) {
    Object.assign(record, {
      meterNumber: order.meterNumber,
      startReading: { value: order.startReading, readAt: order.startDate },
      estimatedAnnualConsumption: annual ?? 0,
      ...(product.unit ? { unit: product.unit } : {}),
    });
  }
  return record;
}
