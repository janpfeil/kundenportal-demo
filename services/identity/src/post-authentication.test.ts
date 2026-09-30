import type { PostAuthenticationTriggerEvent } from "aws-lambda";
import { customerIdFor, type LegacyAccountMigratedDetail } from "@kundenportal/events";
import { describe, expect, it, vi } from "vitest";
import type { AnnouncementRepository } from "./announcements.js";
import { createHandler } from "./post-authentication.js";
import type { IdentityEvents } from "./publisher.js";
import { fakeLegacy } from "./testing.js";

const SUB = "2f4c9b1e-0000-4000-8000-000000000001";

function trigger(attributes: Record<string, string>): PostAuthenticationTriggerEvent {
  return {
    version: "1",
    triggerSource: "PostAuthentication_Authentication",
    region: "eu-central-1",
    userPoolId: "pool",
    userName: SUB,
    callerContext: { awsSdkVersion: "3", clientId: "client" },
    request: {
      userAttributes: {
        sub: SUB,
        email: "anna.becker@example.org",
        name: "Anna Becker",
        ...attributes,
      },
      newDeviceUsed: false,
    },
    response: {},
  } as unknown as PostAuthenticationTriggerEvent;
}

function setup(options: { announced?: boolean; publishFails?: boolean; down?: boolean } = {}) {
  const published: LegacyAccountMigratedDetail[] = [];
  const marks: string[] = [];
  const announcements = {
    announced: vi.fn(async () => options.announced ?? false),
    markAnnounced: vi.fn(async (_t: string, subject: string) => {
      marks.push(subject);
    }),
  } as unknown as AnnouncementRepository;
  const events = {
    legacyAccountMigrated: vi.fn(async (detail: LegacyAccountMigratedDetail) => {
      if (options.publishFails) throw new Error("throttled");
      published.push(detail);
    }),
  } as unknown as IdentityEvents;
  const handler = createHandler({
    access: async () => fakeLegacy({ down: options.down ?? false }),
    announcements,
    events,
    now: () => new Date("2026-09-30T12:00:00Z"),
  });
  return { handler, published, marks };
}

const lazyAnna = { "custom:legacy_ref": "utility:V-1000123", "custom:migration_mode": "lazy" };

describe("post authentication trigger", () => {
  it("announces Anna's lazy migration once with master data and contracts", async () => {
    const { handler, published, marks } = setup();
    await handler(trigger(lazyAnna));
    expect(published).toHaveLength(1);
    expect(published[0]?.payload).toMatchObject({
      customerId: customerIdFor("owner", SUB),
      subject: SUB,
      account: { system: "utility", customerNumber: "V-1000123" },
      mode: "lazy",
      passwordMigrated: true,
      contracts: [{ legacyContractId: "SV-778812", division: "electricity" }],
    });
    expect(marks).toEqual([SUB]);
  });

  it("derives the event id from the legacy account, so a repeat is the same event", async () => {
    const first = setup();
    const second = setup();
    await first.handler(trigger(lazyAnna));
    await second.handler(trigger(lazyAnna));
    expect(first.published[0]?.eventId).toBe(second.published[0]?.eventId);
  });

  it("does nothing for portal-born, bulk-migrated or already announced accounts", async () => {
    const { handler, published } = setup();
    await handler(trigger({}));
    await handler(trigger({ ...lazyAnna, "custom:migration_mode": "bulk" }));
    expect(published).toHaveLength(0);
    const done = setup({ announced: true });
    await done.handler(trigger(lazyAnna));
    expect(done.published).toHaveLength(0);
  });

  it("never fails the sign-in and leaves the marker unset for a retry", async () => {
    const failing = setup({ publishFails: true });
    await expect(failing.handler(trigger(lazyAnna))).resolves.toBeDefined();
    expect(failing.marks).toEqual([]);
    const down = setup({ down: true });
    await expect(down.handler(trigger(lazyAnna))).resolves.toBeDefined();
    expect(down.published).toHaveLength(0);
  });
});
