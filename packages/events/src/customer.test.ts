import { describe, expect, it } from "vitest";
import { CustomerRegistered } from "./customer.js";

const valid = {
  eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  tenantId: "owner",
  occurredAt: "2026-09-29T12:00:00.000Z",
  correlationId: "req-1",
  payload: {
    customerId: "c-1",
    subject: "2f4c9b1e-0000-4000-8000-000000000001",
    email: "anna.becker@example.org",
    displayName: "Anna Becker",
    locale: "de",
    origin: "legacy-utility",
  },
};

describe("CustomerRegistered", () => {
  it("accepts a complete event detail", () => {
    expect(CustomerRegistered.detail.parse(valid)).toEqual(valid);
  });

  it("rejects an event without tenant", () => {
    const { tenantId: _tenantId, ...withoutTenant } = valid;
    expect(CustomerRegistered.detail.safeParse(withoutTenant).success).toBe(false);
  });

  it("rejects an event without subject", () => {
    const { subject: _subject, ...payload } = valid.payload;
    expect(CustomerRegistered.detail.safeParse({ ...valid, payload }).success).toBe(false);
  });

  it("rejects an unknown locale", () => {
    const detail = { ...valid, payload: { ...valid.payload, locale: "fr" } };
    expect(CustomerRegistered.detail.safeParse(detail).success).toBe(false);
  });
});
