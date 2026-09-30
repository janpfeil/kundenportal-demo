import type { BulkMigrationCounts, LegacyAccountRef } from "@kundenportal/events";
import type { Kunde, LegacyAccess, Subscriber } from "@kundenportal/legacy";
import type { AccountProvisioner, ProvisionResult } from "./accounts.js";
import type { MigrationContext } from "./context.js";
import type {
  LinkOffer,
  MigrationRecord,
  MigrationRun,
  RecordTask,
  TimelineEntry,
} from "./model.js";
import type { MigrationEvents } from "./publisher.js";
import type { MigrationRepository } from "./repository.js";

export const PASSWORD = "Altes-Passwort-1";
const NOW = new Date("2026-09-30T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86400000);

const kunde = (overrides: Partial<Kunde>): Kunde => ({
  kundennummer: "V-1000123",
  anrede: "Frau",
  vorname: "Anna",
  nachname: "Becker",
  email: "anna.becker@example.org",
  telefon: null,
  geburtsdatum: "1986-05-14",
  strasse: "Lindenweg",
  hausnummer: "12",
  plz: "04109",
  ort: "Leipzig",
  letzteAnmeldung: daysAgo(12).toISOString(),
  vertraege: [],
  ...overrides,
});

export const UTILITY: Kunde[] = [
  kunde({}),
  kunde({
    kundennummer: "V-1000124",
    vorname: "Bernd",
    nachname: "Yilmaz",
    email: "bernd.yilmaz@example.org",
    geburtsdatum: "1979-11-02",
    strasse: "Hauptstraße",
    hausnummer: "5",
    plz: "04103",
    letzteAnmeldung: daysAgo(40).toISOString(),
  }),
  kunde({
    kundennummer: "V-1000125",
    vorname: "Emil",
    nachname: "Wagner",
    email: null,
    letzteAnmeldung: daysAgo(1100).toISOString(),
  }),
];

const subscriber = (overrides: Partial<Subscriber>): Subscriber => ({
  subscriberId: "T/88-4711",
  name: "Yilmaz, Bernd",
  mail: "b.yilmaz@example.net",
  msisdn: null,
  addressLine: "Hauptstr. 5, 04103 Leipzig",
  dob: "02.11.1979",
  lastLoginAt: Math.floor(daysAgo(20).getTime() / 1000),
  products: [
    {
      productId: "DSL-300455",
      type: "DSL",
      plan: "DSL 250",
      monthlyFee: 44.99,
      dataVolumeGb: null,
      activeSince: "01.03.2020",
    },
  ],
  ...overrides,
});

export const TELCO: Subscriber[] = [
  subscriber({}),
  subscriber({
    subscriberId: "T/88-4712",
    name: "Schulz, Carla",
    mail: "carla.schulz@example.net",
    addressLine: "Rosenstr. 18, 04109 Leipzig",
    dob: "23.07.1992",
    lastLoginAt: Math.floor(daysAgo(730).getTime() / 1000),
    products: [],
  }),
  subscriber({
    subscriberId: "T/88-4713",
    name: "Kraus, Helga",
    mail: "helga.kraus@example",
    addressLine: "Parkallee 7, 04105 Leipzig",
    dob: "",
    lastLoginAt: Math.floor(daysAgo(900).getTime() / 1000),
    products: [],
  }),
  subscriber({
    subscriberId: "T/88-4714",
    name: "Otto, Rainer",
    mail: "rainer.otto@example.net",
    addressLine: "Gartenweg 3, Leipzig",
    dob: "11.01.1968",
    lastLoginAt: Math.floor(daysAgo(650).getTime() / 1000),
    products: [],
  }),
];

export function fakeLegacy(): LegacyAccess {
  const legacy = {
    utility: {
      getCustomer: async (_t: string, number: string) =>
        UTILITY.find((k) => k.kundennummer === number),
      exportPage: async (_t: string, page: number, size: number) => ({
        seite: page,
        groesse: size,
        gesamt: UTILITY.length,
        kunden: UTILITY.slice((page - 1) * size, page * size).map((k) => ({
          ...k,
          passwortHash: "$2b$10$x",
        })),
      }),
      verifyLogin: async (_t: string, email: string, password: string) =>
        password === PASSWORD ? UTILITY.find((k) => k.email === email)?.kundennummer : undefined,
    },
    telco: {
      getSubscriber: async (_t: string, id: string) => TELCO.find((s) => s.subscriberId === id),
      exportSlice: async (_t: string, offset: number, limit: number) => {
        const items = TELCO.slice(offset, offset + limit).map((s) => ({
          ...s,
          pwdSalt: "s",
          pwdHash: "h",
        }));
        return {
          total: TELCO.length,
          offset,
          nextOffset: offset + items.length < TELCO.length ? offset + items.length : null,
          items,
        };
      },
    },
    keycloak: {
      verify: async (username: string, password: string) =>
        password === PASSWORD && TELCO.some((s) => s.mail === username)
          ? { sub: "kc", subscriber_id: TELCO.find((s) => s.mail === username)?.subscriberId }
          : undefined,
    },
  };
  return legacy as unknown as LegacyAccess;
}

/** The migration repository in memory, with the same semantics as the DynamoDB one. */
export class MemoryRepository {
  records = new Map<string, MigrationRecord>();
  runs = new Map<string, MigrationRun>();
  offers = new Map<string, LinkOffer>();
  timeline: TimelineEntry[] = [];

  private key = (t: string, a: LegacyAccountRef) => `${t}|${a.system}:${a.customerNumber}`;

  async getRecord(t: string, a: LegacyAccountRef) {
    return this.records.get(this.key(t, a));
  }
  async putRecord(t: string, record: MigrationRecord, final = false) {
    const existing = this.records.get(this.key(t, record.account));
    if (!final && (existing?.status === "migrated" || existing?.status === "linked")) return false;
    this.records.set(this.key(t, record.account), structuredClone(record));
    return true;
  }
  async listRecords(t: string) {
    return [...this.records.entries()].filter(([k]) => k.startsWith(`${t}|`)).map(([, r]) => r);
  }
  async createRun(_t: string, run: MigrationRun) {
    this.runs.set(run.runId, structuredClone(run));
  }
  async getRun(_t: string, runId: string) {
    return this.runs.get(runId);
  }
  async listRuns() {
    return [...this.runs.values()].reverse();
  }
  async countRun(
    _t: string,
    runId: string,
    counts: Partial<BulkMigrationCounts>,
    options: { processed?: number; dispatched?: number } = {},
  ) {
    const run = this.runs.get(runId);
    if (!run) throw new Error("no run");
    for (const [name, value] of Object.entries(counts)) {
      run.counts[name as keyof BulkMigrationCounts] += value ?? 0;
    }
    run.processed += options.processed ?? 0;
    if (options.dispatched !== undefined) run.dispatched = options.dispatched;
    return structuredClone(run);
  }
  async completeRun(_t: string, runId: string, at: string) {
    const run = this.runs.get(runId);
    if (!run || run.status !== "running") return false;
    run.status = "completed";
    run.completedAt = at;
    return true;
  }
  async putOffer(t: string, subject: string, offer: LinkOffer) {
    const key = `${t}|${subject}|${offer.candidate.system}:${offer.candidate.customerNumber}`;
    if (this.offers.has(key)) return false;
    this.offers.set(key, structuredClone(offer));
    return true;
  }
  async getOffer(t: string, subject: string, c: LegacyAccountRef) {
    return this.offers.get(`${t}|${subject}|${c.system}:${c.customerNumber}`);
  }
  async listOffers(t: string, subject: string) {
    return [...this.offers.entries()]
      .filter(([k]) => k.startsWith(`${t}|${subject}|`))
      .map(([, o]) => o);
  }
  async markOfferLinked(t: string, subject: string, c: LegacyAccountRef, at: string) {
    const offer = this.offers.get(`${t}|${subject}|${c.system}:${c.customerNumber}`);
    if (!offer || offer.status !== "offered") return false;
    offer.status = "linked";
    offer.linkedAt = at;
    return true;
  }
  async addTimeline(_t: string, entry: TimelineEntry) {
    this.timeline.unshift(entry);
  }
  async listTimeline() {
    return this.timeline;
  }
}

export interface Published {
  detailType: string;
  detail: { eventId: string; payload: Record<string, unknown> };
}

export function testContext() {
  const repository = new MemoryRepository();
  const published: Published[] = [];
  const dispatched: RecordTask[] = [];
  const removed: LegacyAccountRef[] = [];
  const provisioned: string[] = [];
  let provisionResult: (email: string) => ProvisionResult = (email) => ({
    ok: true,
    subject: `sub-${email}`,
    created: true,
  });
  let ids = 0;
  const ctx: MigrationContext = {
    repository: repository as unknown as MigrationRepository,
    events: {
      publish: async (
        event: { detailType: string; detail: { parse(v: unknown): unknown } },
        detail: unknown,
      ) => {
        published.push({
          detailType: event.detailType,
          detail: event.detail.parse(detail) as Published["detail"],
        });
      },
    } as unknown as MigrationEvents,
    legacy: async () => fakeLegacy(),
    accounts: {
      provision: async (_a: LegacyAccountRef, email: string) => {
        provisioned.push(email);
        return provisionResult(email);
      },
    } as unknown as AccountProvisioner,
    dispatcher: { dispatch: async (task) => void dispatched.push(task) },
    deadLetters: {
      remove: async (_t, account) => {
        removed.push(account);
        return true;
      },
    },
    now: () => NOW,
    newId: () => `00000000-0000-4000-8000-00000000000${ids++}`,
  };
  return {
    ctx,
    repository,
    published,
    dispatched,
    removed,
    provisioned,
    failProvisioning: (reason: string) => {
      provisionResult = () => ({ ok: false, reason });
    },
    types: () => published.map((p) => p.detailType),
  };
}
