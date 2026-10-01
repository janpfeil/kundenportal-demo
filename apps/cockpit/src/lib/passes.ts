/*
 * Rows of the pass table: the passes of GET /tenancy/passes and the open invitations of
 * GET /tenancy/overview, newest first, with the quota usage in percent for the mini bars.
 */

import type { StatusTone } from "@kundenportal/ui";
import type { OpenInvitation, PassStatus, PassSummary, QuotaKind } from "./tenancy";

export const PASS_TONES: Record<PassStatus, StatusTone> = {
  provisioning: "warn",
  active: "ok",
  "quota-exceeded": "err",
  "tearing-down": "info",
  deleted: "neutral",
};

export type PassRow =
  | { kind: "pass"; key: string; email: string; sortKey: string; pass: PassSummary }
  | {
      kind: "invitation";
      key: string;
      email: string;
      sortKey: string;
      invitation: OpenInvitation;
    };

/** Passes and open invitations in one list, newest first (issued or invited). */
export function passRows(
  passes: readonly PassSummary[],
  invitations: readonly OpenInvitation[],
): PassRow[] {
  const rows: PassRow[] = [
    ...invitations.map((invitation): PassRow => ({
      kind: "invitation",
      key: `invitation-${invitation.invitationId}`,
      email: invitation.email,
      sortKey: invitation.createdAt,
      invitation,
    })),
    ...passes.map((pass): PassRow => ({
      kind: "pass",
      key: `pass-${pass.passId}`,
      email: pass.email,
      // Without the issue time the end of validity still orders newer passes first.
      sortKey: pass.createdAt ?? pass.validUntil,
      pass,
    })),
  ];
  return rows.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

export const QUOTA_KINDS: readonly QuotaKind[] = ["api", "events", "uploads"];

/** Used share of one quota in whole percent; undefined when the pass has no such quota. */
export function quotaPercent(pass: PassSummary, kind: QuotaKind): number | undefined {
  const quota = pass.quotas[kind];
  if (!quota) return undefined;
  if (quota.limit <= 0) return quota.used > 0 ? 100 : 0;
  return Math.round((quota.used / quota.limit) * 100);
}

/** Passes still running whose holder has not signed in yet (fallback without the overview). */
export function neverSignedIn(passes: readonly PassSummary[]): number {
  return passes.filter(
    (pass) => (pass.status === "active" || pass.status === "provisioning") && !pass.activatedAt,
  ).length;
}
