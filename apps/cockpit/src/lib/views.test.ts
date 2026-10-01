import { describe, expect, it } from "vitest";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import { clarificationDelta, problemText, progressOf, recordAnchor, redriveDelta } from "./cockpit";
import { EVENT_TYPES, eventLook, eventTitle } from "./events";
import { neverSignedIn, passRows, quotaPercent } from "./passes";
import { groupResults, matchPasses, readQuery } from "./search";
import type { PassSummary } from "./tenancy";
import { clockTime, dayStamp, relativeTime, shortStamp } from "./time";

// 1 October 2026, 10:42:18 in Germany (summer time, UTC+2).
const NOW = new Date("2026-10-01T08:42:18Z");

describe("times in German time", () => {
  it("shows the live clock and short stamps", () => {
    expect(clockTime(NOW)).toBe("10:42:18");
    expect(shortStamp("2026-10-01T08:41:00Z", NOW, "de")).toBe("10:41");
    expect(shortStamp("2026-09-30T15:05:00Z", NOW, "de")).toBe("30.09. 17:05");
    expect(dayStamp("2026-09-30T15:05:00Z", "en")).toBe("30/09 17:05");
    // Just after midnight in Germany is still the previous day in UTC.
    expect(shortStamp("2026-09-30T22:10:00Z", NOW, "de")).toBe("00:10");
  });

  it("says how long ago the last activity was", () => {
    const ago = (iso: string, locale: "de" | "en" = "de") =>
      relativeTime(iso, NOW, locale === "de" ? de.time : en.time, locale);
    expect(ago("2026-10-01T08:42:00Z")).toBe("gerade eben");
    expect(ago("2026-10-01T08:38:00Z")).toBe("vor 4 Min.");
    expect(ago("2026-10-01T06:40:00Z")).toBe("vor 2 Std.");
    expect(ago("2026-09-30T19:15:00Z")).toBe("gestern 21:15");
    expect(ago("2026-09-28T17:44:00Z")).toBe("28.09. 19:44");
    expect(ago("2026-10-01T08:38:00Z", "en")).toBe("4 min ago");
    expect(ago("2026-09-30T19:15:00Z", "en")).toBe("yesterday 21:15");
    // A clock a little ahead of the server's is no "in 2 minutes".
    expect(ago("2026-10-01T08:44:00Z")).toBe("gerade eben");
    expect(ago("kaputt")).toBe("kaputt");
  });

  it("finds yesterday across the end of summer time", () => {
    // 26 October 2026, 08:00 German winter time; 25 October had 25 hours.
    const monday = new Date("2026-10-26T07:00:00Z");
    expect(relativeTime("2026-10-25T20:00:00Z", monday, de.time, "de")).toBe("gestern 21:00");
  });
});

describe("cockpit key figures", () => {
  it("counts migrated and linked records as done, with the share and today's increase", () => {
    expect(
      progressOf({
        system: "utility",
        total: 2400,
        migratedToday: 126,
        counts: { migrated: 1800, linked: 42, clarification: 14 },
      }),
    ).toEqual({ system: "utility", done: 1842, total: 2400, percent: 77, today: 126 });
    // An unreachable legacy system has no total: no share.
    expect(
      progressOf({ system: "telco", migratedToday: 0, counts: { migrated: 3 } }),
    ).toMatchObject({ done: 3, total: undefined, percent: 0 });
  });

  it("colours new clarification cases as bad and redrives as good", () => {
    const trends = {
      days: [],
      clarifications: [],
      deadLetters: [],
      newClarifications: 3,
      redriven: 2,
    };
    expect(clarificationDelta(trends, de.kpis.sinceYesterday)).toEqual({
      text: "+3 seit gestern",
      tone: "bad",
    });
    expect(redriveDelta(trends, de.kpis.redriven)).toEqual({
      text: "−2 nach Redrive",
      tone: "good",
    });
    const calm = { ...trends, newClarifications: 0, redriven: 0 };
    expect(clarificationDelta(calm, de.kpis.sinceYesterday).tone).toBe("neutral");
    expect(redriveDelta(calm, de.kpis.redriven).tone).toBe("neutral");
  });

  it("names the problem of a record in words", () => {
    const problem = (code: string | undefined, fields: string[], message = "x") =>
      problemText({ code, fields, message } as never, de.problems);
    expect(problem("invalid-field", ["email"])).toBe("keine gültige E-Mail");
    expect(problem("missing-required-field", ["email"])).toBe("keine E-Mail-Adresse");
    expect(problem("missing-required-field", ["postalCode"])).toBe("Postleitzahl fehlt");
    expect(problem("missing-required-field", ["street", "postalCode"])).toBe(
      "Pflichtangaben fehlen: Straße, Postleitzahl",
    );
    expect(problem("invalid-field", ["plan"])).toBe("Tarif ungültig");
    expect(problem("legacy-unavailable", [])).toBe("Altsystem nicht erreichbar");
    expect(problem("identity-conflict", ["email"])).toBe("Konflikt mit bestehendem Konto");
    expect(problem(undefined, [], "Something odd")).toBe("Something odd");
    expect(problem("missing-required-field", ["shoeSize"])).toBe("shoeSize fehlt");
  });

  it("links clarification cases and dead letters to their place on the overview", () => {
    expect(recordAnchor("clarification")).toBe("?klaerfaelle=alle#klaerfaelle");
    expect(recordAnchor("failed")).toBe("#dlq");
    expect(recordAnchor("migrated")).toBeUndefined();
  });
});

describe("timeline events", () => {
  it("gives every known event type an icon, a colour and a title in both languages", () => {
    for (const type of EVENT_TYPES) {
      expect(eventLook(type).icon).not.toBe("info");
      expect(de.events.titles[type]).toBeTruthy();
      expect(en.events.titles[type]).toBeTruthy();
    }
    expect(eventLook("LegacyAccountMigrated")).toEqual({ icon: "check", tone: "ok" });
    expect(eventLook("MigrationRecordFailed")).toEqual({ icon: "x", tone: "err" });
    expect(eventLook("AccountsLinked")).toEqual({ icon: "link", tone: "neutral" });
    expect(eventLook("DuplicateCandidateFound")).toEqual({ icon: "alert", tone: "warn" });
    expect(eventLook("MeterReadingSubmitted")).toEqual({ icon: "bolt", tone: "ok" });
    expect(eventLook("TenantProvisioned").icon).toBe("ticket");
    expect(eventLook("MigratedAccountsRemoved").icon).toBe("refresh");
    expect(eventLook("SomethingNew")).toEqual({ icon: "info", tone: "neutral" });
  });

  it("titles events and names the system of a bulk import", () => {
    const title = (type: string, summary: string) =>
      eventTitle(type, summary, de.events, de.systems);
    expect(title("LegacyAccountMigrated", "utility:V-1 lazy")).toBe("Konto übernommen");
    expect(title("BulkMigrationStarted", "telco")).toBe("Bulk-Import Telko gestartet");
    expect(title("BulkMigrationCompleted", "utility 3 migrated, 0 failed")).toBe(
      "Bulk-Import Versorger abgeschlossen",
    );
    expect(title("BulkMigrationStarted", "")).toBe("Bulk-Import gestartet");
    expect(title("SomethingNew", "")).toBe("Ereignis");
  });
});

const pass = (over: Partial<PassSummary>): PassSummary => ({
  passId: "p1",
  tenantId: "p4k7x2qa",
  email: "gast@example.org",
  status: "active",
  validUntil: "2026-10-03T08:00:00Z",
  quotas: {},
  ...over,
});

describe("cockpit search", () => {
  it("reads the query: empty, too short, cut to 60 characters", () => {
    expect(readQuery(undefined)).toEqual({ kind: "empty" });
    expect(readQuery("   ")).toEqual({ kind: "empty" });
    expect(readQuery(" a ")).toEqual({ kind: "short", query: "a" });
    expect(readQuery(["T/88", "x"])).toEqual({ kind: "ok", query: "T/88" });
    expect(readQuery("x".repeat(80))).toEqual({ kind: "ok", query: "x".repeat(60) });
  });

  it("finds pass tenants by tenant, address or pass id, in any case", () => {
    const passes = [
      pass({ passId: "a", tenantId: "pAAAA", email: "one@example.org", createdAt: "2026-09-01" }),
      pass({ passId: "b", tenantId: "pBBBB", email: "Two@Example.net", createdAt: "2026-09-02" }),
    ];
    expect(matchPasses(passes, "example").map((p) => p.passId)).toEqual(["b", "a"]);
    expect(matchPasses(passes, "paaaa").map((p) => p.passId)).toEqual(["a"]);
    expect(matchPasses(passes, "two@").map((p) => p.passId)).toEqual(["b"]);
    expect(matchPasses(passes, "nobody")).toEqual([]);
  });

  it("groups accounts, tenants (owner only) and events", () => {
    const result = {
      query: "88",
      accounts: [{ id: "r1" }],
      events: [{ eventId: "e1" }, { eventId: "e2" }],
    } as never;
    const passes = [pass({ tenantId: "p88aaaa" })];
    expect(groupResults(result, passes, "88", true)).toMatchObject({
      tenants: [{ tenantId: "p88aaaa" }],
      total: 4,
    });
    const holder = groupResults(result, passes, "88", false);
    expect(holder.tenants).toBeUndefined();
    expect(holder.total).toBe(3);
    expect(groupResults(undefined, undefined, "88", true)).toEqual({
      accounts: [],
      tenants: [],
      events: [],
      total: 0,
    });
  });
});

describe("pass table", () => {
  it("lists open invitations and passes together, newest first", () => {
    const rows = passRows(
      [
        pass({ passId: "old", createdAt: "2026-09-27T10:00:00Z" }),
        pass({ passId: "new", createdAt: "2026-09-30T10:00:00Z" }),
      ],
      [
        {
          invitationId: "i1",
          email: "m.schulz@example.com",
          createdAt: "2026-10-01T08:00:00Z",
          expiresAt: "2026-10-15T08:00:00Z",
          shortLived: false,
        },
      ],
    );
    expect(rows.map((row) => row.key)).toEqual(["invitation-i1", "pass-new", "pass-old"]);
  });

  it("turns quota usage into percent and counts holders who never signed in", () => {
    const used = pass({
      quotas: { api: { used: 1250, limit: 5000 }, events: { used: 1010, limit: 1000 } },
    });
    expect(quotaPercent(used, "api")).toBe(25);
    expect(quotaPercent(used, "events")).toBe(101);
    expect(quotaPercent(used, "uploads")).toBeUndefined();
    expect(
      neverSignedIn([
        pass({}),
        pass({ activatedAt: "2026-09-30T10:00:00Z" }),
        pass({ status: "deleted" }),
      ]),
    ).toBe(1);
  });
});
