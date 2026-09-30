import { Division, IsoDate, MeterUnit } from "@kundenportal/events";
import { z } from "zod";

/** What the consumption domain knows about a contract (own projection of `ContractChanged`). */
export const ContractProjection = z.object({
  contractId: z.uuid(),
  customerId: z.string().min(1),
  division: Division,
  meterNumber: z.string().optional(),
  unit: MeterUnit.optional(),
  dataVolumeMb: z.number().int().positive().optional(),
  status: z.enum(["active", "terminated"]),
  version: z.number().int().positive(),
});
export type ContractProjection = z.infer<typeof ContractProjection>;

/** A meter reading; mirrors `MeterReading` in the OpenAPI contract. */
export const MeterReading = z.object({
  readingId: z.string(),
  value: z.number().nonnegative(),
  unit: MeterUnit,
  readAt: IsoDate,
  /** `contract-start`: reference reading from the contract, `customer`: entered in the portal. */
  source: z.enum(["contract-start", "customer"]),
  submittedAt: z.iso.datetime({ offset: true }),
});
export type MeterReading = z.infer<typeof MeterReading>;

/** Body of `POST /contracts/{contractId}/readings`. */
export const NewReading = z.strictObject({
  value: z.number().nonnegative().max(1_000_000_000),
  readAt: IsoDate,
});
export type NewReading = z.infer<typeof NewReading>;

/**
 * Sortable reading id: the submission time (base 36, fixed width) plus a UUID, like the
 * notification ids. The sort key `READING#<readAt>#<readingId>` orders by reading date
 * first, then by submission.
 */
export function readingId(submittedAt: string, uuid: string): string {
  return `${Date.parse(submittedAt).toString(36).padStart(9, "0")}-${uuid}`;
}

/** Today's date in Germany, where the meters are (a reading "today" must not be rejected at 00:30). */
export function todayInGermany(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
}

/** Share of the data volume at which the customer is warned (J5). */
export const DATA_VOLUME_THRESHOLD_PERCENT = 80;

export interface DataUsage {
  contractId: string;
  month: string;
  includedMb: number;
  usedMb: number;
  usedPercent: number;
  thresholdPercent: number;
  asOf: string;
}

/**
 * Demo data volume of a mobile contract (there is no network to measure it): usage
 * starts each month at 40 % of the included volume and grows linearly to 100 % at the
 * end of the month (UTC). The warning threshold of 80 % is therefore reached after two
 * thirds of the month, around the 20th.
 */
export function demoUsage(contractId: string, includedMb: number, now: Date): DataUsage {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const elapsed = (now.getTime() - start) / (end - start);
  const usedMb = Math.round(includedMb * (0.4 + 0.6 * elapsed));
  return {
    contractId,
    month: now.toISOString().slice(0, 7),
    includedMb,
    usedMb,
    usedPercent: Math.floor((usedMb * 100) / includedMb),
    thresholdPercent: DATA_VOLUME_THRESHOLD_PERCENT,
    asOf: now.toISOString(),
  };
}
