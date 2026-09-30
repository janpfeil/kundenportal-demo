import { describe, expect, it } from "vitest";
import { EventSource } from "./envelope.js";
import {
  DemoPassExpired,
  DemoPassIssued,
  InvitationCreated,
  PassTenantId,
  QuotaExceeded,
  TenantDeleted,
  TenantProvisioned,
} from "./tenancy.js";

const tenantId = "p4k7x2qa";
const metadata = {
  eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  tenantId,
  occurredAt: "2026-09-30T12:00:00.000Z",
  correlationId: "req-1",
};
const pass = { passId: "pass-1", tenantId };

const cases = [
  [
    "InvitationCreated",
    InvitationCreated,
    {
      invitationId: "inv-1",
      email: "gast@example.org",
      expiresAt: "2026-10-14T12:00:00.000Z",
      createdBy: "owner-sub",
    },
  ],
  [
    "DemoPassIssued",
    DemoPassIssued,
    {
      ...pass,
      invitationId: "inv-1",
      email: "gast@example.org",
      validUntil: "2026-10-07T12:00:00.000Z",
    },
  ],
  [
    "TenantProvisioned",
    TenantProvisioned,
    { ...pass, tableName: "kp-tenant-p4k7x2qa", durationMs: 23000 },
  ],
  ["QuotaExceeded", QuotaExceeded, { ...pass, kind: "api", limit: 5000 }],
  ["DemoPassExpired", DemoPassExpired, { ...pass, reason: "expired" }],
  ["TenantDeleted", TenantDeleted, { ...pass, deletedAccounts: 3 }],
] as const;

describe("tenancy events", () => {
  it.each(cases)("%s accepts a valid detail from the tenancy source", (name, event, payload) => {
    expect(event.source).toBe(EventSource.tenancy);
    expect(event.detailType).toBe(name);
    expect(event.detail.parse({ ...metadata, payload })).toMatchObject({ payload });
  });

  it("accepts only random pass tenant ids", () => {
    expect(PassTenantId.safeParse("p4k7x2qa").success).toBe(true);
    for (const bad of ["owner", "p4k9x2q", "p4k7x2qa1", "P4K9X2QA", "p4k9x0qa"]) {
      expect(PassTenantId.safeParse(bad).success).toBe(false);
    }
  });

  it("never carries an invitation token", () => {
    const parsed = InvitationCreated.detail.parse({
      ...metadata,
      payload: { ...cases[0][2], token: "secret" },
    });
    expect(parsed.payload).not.toHaveProperty("token");
  });

  it("rejects a quota of an unknown kind", () => {
    const result = QuotaExceeded.detail.safeParse({
      ...metadata,
      payload: { ...pass, kind: "mails", limit: 1 },
    });
    expect(result.success).toBe(false);
  });
});
