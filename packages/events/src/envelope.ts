import { z } from "zod";

/** Source identifiers used as EventBridge `source` for each domain. */
export const EventSource = {
  customer: "kundenportal.customer",
  notification: "kundenportal.notification",
  contract: "kundenportal.contract",
  consumption: "kundenportal.consumption",
  documents: "kundenportal.documents",
  identity: "kundenportal.identity",
  migration: "kundenportal.migration",
  tenancy: "kundenportal.tenancy",
} as const;
export type EventSource = (typeof EventSource)[keyof typeof EventSource];

/**
 * Metadata every domain event carries, independent of its type.
 * The tenant id is part of every event so consumers never mix tenants.
 */
export const eventMetadataSchema = z.object({
  eventId: z.uuid(),
  tenantId: z.string().min(1),
  occurredAt: z.iso.datetime({ offset: true }),
  correlationId: z.string().min(1),
});
export type EventMetadata = z.infer<typeof eventMetadataSchema>;

/** Builds the `detail` schema of an event: metadata plus a typed payload. */
export function eventDetailSchema<T extends z.ZodType>(payload: T) {
  return eventMetadataSchema.extend({ payload });
}
