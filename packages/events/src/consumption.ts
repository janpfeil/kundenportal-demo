import { z } from "zod";
import { Division, IsoDate, MeterUnit } from "./contract.js";
import { EventSource, eventDetailSchema } from "./envelope.js";

/** A customer submitted a plausible meter reading for one of their contracts. */
export const MeterReadingSubmitted = {
  source: EventSource.consumption,
  detailType: "MeterReadingSubmitted",
  detail: eventDetailSchema(
    z.object({
      customerId: z.string().min(1),
      contractId: z.uuid(),
      division: Division,
      meterNumber: z.string().min(1),
      readingId: z.string().min(1),
      value: z.number().nonnegative(),
      unit: MeterUnit,
      readAt: IsoDate,
    }),
  ),
} as const;
export type MeterReadingSubmittedDetail = z.infer<typeof MeterReadingSubmitted.detail>;

/** Scheduled check: the data volume of a mobile contract reached the warning threshold. */
export const DataVolumeThresholdReached = {
  source: EventSource.consumption,
  detailType: "DataVolumeThresholdReached",
  detail: eventDetailSchema(
    z.object({
      customerId: z.string().min(1),
      contractId: z.uuid(),
      /** Billing month, e.g. `2026-09`. */
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      usedMb: z.number().int().nonnegative(),
      includedMb: z.number().int().positive(),
      thresholdPercent: z.number().int().min(1).max(100),
    }),
  ),
} as const;
export type DataVolumeThresholdReachedDetail = z.infer<typeof DataVolumeThresholdReached.detail>;
