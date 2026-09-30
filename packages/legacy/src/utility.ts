import { type Division, type LegacyContract, type MeterUnit } from "@kundenportal/events";
import { z } from "zod";
import { callJson, type Fetch, LegacyUnavailableError } from "./http.js";
import type { Corrections, MappingResult } from "./mapped.js";
import { expandStreet, toCents } from "./normalize.js";

/** Customer of the utility's legacy system (`versorger.openapi.yaml`, schema `Kunde`). */
export const Kunde = z.object({
  kundennummer: z.string(),
  anrede: z.string(),
  vorname: z.string(),
  nachname: z.string(),
  email: z.string().nullable(),
  telefon: z.string().nullable(),
  geburtsdatum: z.string().nullable(),
  strasse: z.string(),
  hausnummer: z.string(),
  plz: z.string(),
  ort: z.string(),
  letzteAnmeldung: z.string(),
  vertraege: z.array(
    z.object({
      vertragsnummer: z.string(),
      sparte: z.string(),
      tarif: z.string(),
      abschlag: z.string(),
      zaehlernummer: z.string(),
      letzterZaehlerstand: z.object({ wert: z.number(), ablesedatum: z.string() }),
      beginn: z.string(),
    }),
  ),
});
export type Kunde = z.infer<typeof Kunde>;

const ExportPage = z.object({
  seite: z.number(),
  groesse: z.number(),
  gesamt: z.number(),
  kunden: z.array(Kunde.extend({ passwortHash: z.string() })),
});

export interface UtilityClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: Fetch;
  timeoutMs?: number;
}

/** REST client of the utility's legacy system. */
export class UtilityClient {
  private readonly fetchImpl: Fetch;

  constructor(private readonly options: UtilityClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  private request(tenant: string, path: string, init: RequestInit = {}) {
    return callJson(this.fetchImpl, `${this.options.baseUrl}${path}`, {
      ...init,
      timeoutMs: this.options.timeoutMs ?? 3000,
      headers: {
        "x-api-key": this.options.apiKey,
        "x-mandant": tenant,
        "content-type": "application/json",
      },
    });
  }

  /** Checks the password against the legacy bcrypt hash; returns the customer number. */
  async verifyLogin(tenant: string, email: string, password: string): Promise<string | undefined> {
    const { status, body } = await this.request(tenant, "/api/v1/anmeldung/pruefen", {
      method: "POST",
      body: JSON.stringify({ email, passwort: password }),
    });
    if (status === 401 || status === 400) return undefined;
    const parsed = z.object({ kundennummer: z.string() }).safeParse(body);
    if (status !== 200 || !parsed.success)
      throw new LegacyUnavailableError(`verify: HTTP ${status}`);
    return parsed.data.kundennummer;
  }

  async getCustomer(tenant: string, customerNumber: string): Promise<Kunde | undefined> {
    const { status, body } = await this.request(
      tenant,
      `/api/v1/kunden/${encodeURIComponent(customerNumber)}`,
    );
    if (status === 404) return undefined;
    const parsed = Kunde.safeParse(body);
    if (status !== 200 || !parsed.success) throw new LegacyUnavailableError(`read: HTTP ${status}`);
    return parsed.data;
  }

  async findByEmail(tenant: string, email: string): Promise<Kunde | undefined> {
    const { status, body } = await this.request(
      tenant,
      `/api/v1/kunden?email=${encodeURIComponent(email)}`,
    );
    const parsed = z.object({ kunden: z.array(Kunde) }).safeParse(body);
    if (status !== 200 || !parsed.success) throw new LegacyUnavailableError(`find: HTTP ${status}`);
    return parsed.data.kunden[0];
  }

  async exportPage(tenant: string, page: number, size: number) {
    const { status, body } = await this.request(
      tenant,
      `/api/v1/kunden/export?seite=${page}&groesse=${size}`,
    );
    const parsed = ExportPage.safeParse(body);
    if (status !== 200 || !parsed.success)
      throw new LegacyUnavailableError(`export: HTTP ${status}`);
    return parsed.data;
  }
}

const DIVISIONS: Record<string, { division: Division; unit: MeterUnit }> = {
  STROM: { division: "electricity", unit: "kWh" },
  GAS: { division: "gas", unit: "m3" },
  WASSER: { division: "water", unit: "m3" },
};

/** Legacy tariff names → the portal's tariff options (contract domain catalogue). */
const TARIFF_OPTIONS: Record<string, string> = {
  "Strom Klassik": "standard",
  "Strom Öko": "oeko",
  "Gas Komfort": "standard",
  "Gas Klima": "klima",
  "Wasser Basis": "standard",
};

const Email = z.email();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Maps a utility customer to the portal's terms, applying operator corrections first. */
export function mapUtilityCustomer(kunde: Kunde, corrections: Corrections = {}): MappingResult {
  const account = { system: "utility", customerNumber: kunde.kundennummer } as const;
  const displayName = `${kunde.vorname} ${kunde.nachname}`.trim();
  const base = { account, displayName, lastSignInAt: kunde.letzteAnmeldung };
  const email = corrections.email ?? kunde.email;
  if (!email) {
    return {
      ok: false,
      ...base,
      kind: "clarification",
      code: "missing-required-field",
      message: "No email address in the legacy system; the customer cannot sign in",
      fields: ["email"],
    };
  }
  if (!Email.safeParse(email).success) {
    return {
      ok: false,
      ...base,
      kind: "clarification",
      code: "invalid-field",
      message: `Invalid email address "${email}"`,
      fields: ["email"],
    };
  }
  const address = {
    street: expandStreet(corrections.street ?? kunde.strasse),
    houseNumber: (corrections.houseNumber ?? kunde.hausnummer).trim(),
    postalCode: (corrections.postalCode ?? kunde.plz).trim(),
    city: (corrections.city ?? kunde.ort).trim(),
  };
  const missing = [
    ...(!kunde.vorname.trim() ? ["vorname"] : []),
    ...(!kunde.nachname.trim() ? ["nachname"] : []),
    ...(!address.street ? ["street"] : []),
    ...(!address.houseNumber ? ["houseNumber"] : []),
    ...(!/^\d{5}$/.test(address.postalCode) ? ["postalCode"] : []),
    ...(!address.city ? ["city"] : []),
  ];
  if (missing.length > 0) {
    return {
      ok: false,
      ...base,
      kind: "failed",
      code: "missing-required-field",
      message: `Required master data missing or malformed: ${missing.join(", ")}`,
      fields: missing,
    };
  }

  const contracts: LegacyContract[] = [];
  for (const vertrag of kunde.vertraege) {
    const division = DIVISIONS[vertrag.sparte];
    if (!division) {
      return {
        ok: false,
        ...base,
        kind: "failed",
        code: "invalid-field",
        message: `Unknown division ${vertrag.sparte} in contract ${vertrag.vertragsnummer}`,
        fields: ["sparte"],
      };
    }
    contracts.push({
      legacyContractId: vertrag.vertragsnummer,
      division: division.division,
      tariffOption: TARIFF_OPTIONS[vertrag.tarif] ?? "standard",
      monthlyInstallmentCent: toCents(vertrag.abschlag),
      meterNumber: vertrag.zaehlernummer,
      unit: division.unit,
      lastReading: {
        value: vertrag.letzterZaehlerstand.wert,
        readAt: vertrag.letzterZaehlerstand.ablesedatum,
      },
      startDate: vertrag.beginn,
    });
  }

  return {
    ok: true,
    account,
    email: email.toLowerCase(),
    displayName,
    profile: {
      firstName: kunde.vorname.trim(),
      lastName: kunde.nachname.trim(),
      address,
      ...(kunde.telefon ? { phone: kunde.telefon } : {}),
      ...(kunde.geburtsdatum && ISO_DATE.test(kunde.geburtsdatum)
        ? { birthDate: kunde.geburtsdatum }
        : {}),
    },
    contracts,
    lastSignInAt: kunde.letzteAnmeldung,
  };
}
