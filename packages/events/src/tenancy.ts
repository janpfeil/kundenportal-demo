import { z } from "zod";
import { EventSource, eventDetailSchema } from "./envelope.js";

/**
 * Tenant of a demo pass: "p" plus seven base32 characters, e.g. `p4k7x2qa`. Random, so
 * nobody guesses another visitor's tenant; short enough for table names and the legacy
 * systems' tenant header.
 */
export const PassTenantId = z.string().regex(/^p[a-z2-7]{7}$/);
export type PassTenantId = z.infer<typeof PassTenantId>;

/** Things a demo pass is limited in (docs/wiki/architektur-mandanten.md §5). */
export const QuotaKind = z.enum(["api", "events", "uploads"]);
export type QuotaKind = z.infer<typeof QuotaKind>;

/** Why a pass ended before or at its end date. */
export const PassEndReason = z.enum(["expired", "revoked"]);
export type PassEndReason = z.infer<typeof PassEndReason>;

const PassRef = {
  passId: z.string().min(1),
  tenantId: PassTenantId,
};

/**
 * The owner created an invitation link. The event names the invited address but never
 * the link's token, which only the invited person receives.
 */
export const InvitationCreated = {
  source: EventSource.tenancy,
  detailType: "InvitationCreated",
  detail: eventDetailSchema(
    z.object({
      invitationId: z.string().min(1),
      email: z.email(),
      expiresAt: z.iso.datetime({ offset: true }),
      /** Subject of the owner who created it. */
      createdBy: z.string().min(1),
    }),
  ),
} as const;
export type InvitationCreatedDetail = z.infer<typeof InvitationCreated.detail>;

/** An invitation was redeemed: the pass exists and its tenant is being set up. */
export const DemoPassIssued = {
  source: EventSource.tenancy,
  detailType: "DemoPassIssued",
  detail: eventDetailSchema(
    z.object({
      ...PassRef,
      invitationId: z.string().min(1),
      email: z.email(),
      validUntil: z.iso.datetime({ offset: true }),
    }),
  ),
} as const;
export type DemoPassIssuedDetail = z.infer<typeof DemoPassIssued.detail>;

/** The tenant of a pass is ready: own table, legacy data, the holder's account. */
export const TenantProvisioned = {
  source: EventSource.tenancy,
  detailType: "TenantProvisioned",
  detail: eventDetailSchema(
    z.object({
      ...PassRef,
      tableName: z.string().min(1),
      /** Time from redeeming to ready, for the "under one minute" goal. */
      durationMs: z.number().int().nonnegative(),
    }),
  ),
} as const;
export type TenantProvisionedDetail = z.infer<typeof TenantProvisioned.detail>;

/** A pass reached one of its limits; further use of that kind is refused. */
export const QuotaExceeded = {
  source: EventSource.tenancy,
  detailType: "QuotaExceeded",
  detail: eventDetailSchema(
    z.object({
      ...PassRef,
      kind: QuotaKind,
      limit: z.number().int().positive(),
    }),
  ),
} as const;
export type QuotaExceededDetail = z.infer<typeof QuotaExceeded.detail>;

/** A pass ended; the teardown of its tenant starts. */
export const DemoPassExpired = {
  source: EventSource.tenancy,
  detailType: "DemoPassExpired",
  detail: eventDetailSchema(
    z.object({
      ...PassRef,
      reason: PassEndReason,
    }),
  ),
} as const;
export type DemoPassExpiredDetail = z.infer<typeof DemoPassExpired.detail>;

/** Everything of the tenant is gone: table, legacy data, uploads, accounts, schedule. */
export const TenantDeleted = {
  source: EventSource.tenancy,
  detailType: "TenantDeleted",
  detail: eventDetailSchema(
    z.object({
      ...PassRef,
      /** Cognito accounts removed with the tenant. */
      deletedAccounts: z.number().int().nonnegative(),
    }),
  ),
} as const;
export type TenantDeletedDetail = z.infer<typeof TenantDeleted.detail>;
