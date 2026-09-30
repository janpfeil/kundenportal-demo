import { LegacyAccountMigrated } from "@kundenportal/events";
import { describe, expect, it, vi } from "vitest";
import { KeycloakPasswordCheck } from "./keycloak.js";
import {
  addressKey,
  expandStreet,
  fold,
  germanDateToIso,
  parseAddressLine,
  toCents,
} from "./normalize.js";
import { mapTelcoSubscriber, type Subscriber, TelcoClient } from "./telco.js";
import { type Kunde, mapUtilityCustomer, UtilityClient } from "./utility.js";
import { LegacyUnavailableError } from "./http.js";

const anna: Kunde = {
  kundennummer: "V-1000123",
  anrede: "Frau",
  vorname: "Anna",
  nachname: "Becker",
  email: "Anna.Becker@example.org",
  telefon: "0341 2345678",
  geburtsdatum: "1986-05-14",
  strasse: "Lindenweg",
  hausnummer: "12",
  plz: "04109",
  ort: "Leipzig",
  letzteAnmeldung: "2026-09-18T12:00:00.000Z",
  vertraege: [
    {
      vertragsnummer: "SV-778812",
      sparte: "STROM",
      tarif: "Strom Öko",
      abschlag: "87.00",
      zaehlernummer: "1EMH0012345678",
      letzterZaehlerstand: { wert: 18234, ablesedatum: "2026-04-03" },
      beginn: "2019-04-01",
    },
  ],
};

const bernd: Subscriber = {
  subscriberId: "T/88-4711",
  name: "Yilmaz, Bernd",
  mail: "b.yilmaz@example.net",
  msisdn: "+49 170 5550101",
  addressLine: "Hauptstr. 5, 04103 Leipzig",
  dob: "02.11.1979",
  lastLoginAt: 1790000000,
  products: [
    {
      productId: "MOB-812233",
      type: "MOBILE",
      plan: "Mobil 20 GB",
      monthlyFee: 19.99,
      dataVolumeGb: 20,
      activeSince: "15.02.2021",
    },
  ],
};

describe("normalisation", () => {
  it("expands street abbreviations", () => {
    expect(expandStreet("Hauptstr.")).toBe("Hauptstraße");
    expect(expandStreet("Karl-Liebknecht-Str.")).toBe("Karl-Liebknecht-Straße");
    expect(expandStreet("Gartenstrasse")).toBe("Gartenstraße");
    expect(expandStreet("Marktpl.")).toBe("Marktplatz");
    expect(expandStreet("Lindenweg")).toBe("Lindenweg");
  });

  it("treats 'Hauptstr. 5' and 'Hauptstraße 5' as the same address", () => {
    const line = parseAddressLine("Hauptstr. 5, 04103 Leipzig");
    expect(line).toEqual({
      street: "Hauptstraße",
      houseNumber: "5",
      postalCode: "04103",
      city: "Leipzig",
    });
    const separate = {
      street: "Hauptstraße",
      houseNumber: "5",
      postalCode: "04103",
      city: "Leipzig",
    };
    expect(addressKey(separate)).toBe(addressKey({ ...separate, street: "Hauptstr." }));
    expect(addressKey(separate)).not.toBe(addressKey({ ...separate, houseNumber: "7" }));
  });

  it("parses address lines without postal code or with house number suffixes", () => {
    expect(parseAddressLine("Gartenweg 3, Leipzig")).toEqual({
      street: "Gartenweg",
      houseNumber: "3",
      city: "Leipzig",
    });
    expect(parseAddressLine("Am Wasserturm 3 A, 04155 Leipzig").houseNumber).toBe("3a");
  });

  it("folds umlauts and case, converts dates and amounts", () => {
    expect(fold("Müller-Lüdenscheidt")).toBe(fold("mueller lüdenscheidt"));
    expect(germanDateToIso("02.11.1979")).toBe("1979-11-02");
    expect(germanDateToIso("")).toBeUndefined();
    expect(toCents("87.00")).toBe(8700);
    expect(toCents(19.99)).toBe(1999);
    expect(() => toCents("abc")).toThrow();
  });
});

const migrated = (mapped: ReturnType<typeof mapUtilityCustomer>) => {
  if (!mapped.ok) throw new Error(mapped.message);
  return LegacyAccountMigrated.detail.parse({
    eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
    tenantId: "owner",
    occurredAt: "2026-09-30T12:00:00.000Z",
    correlationId: "c",
    payload: {
      customerId: "c-1",
      subject: "s-1",
      email: mapped.email,
      displayName: mapped.displayName,
      locale: "de",
      account: mapped.account,
      mode: "lazy",
      passwordMigrated: true,
      profile: mapped.profile,
      contracts: mapped.contracts,
    },
  });
};

describe("utility mapping", () => {
  it("maps Anna to a valid LegacyAccountMigrated payload", () => {
    const event = migrated(mapUtilityCustomer(anna));
    expect(event.payload.email).toBe("anna.becker@example.org");
    expect(event.payload.contracts[0]).toMatchObject({
      division: "electricity",
      tariffOption: "oeko",
      monthlyInstallmentCent: 8700,
      unit: "kWh",
      lastReading: { value: 18234, readAt: "2026-04-03" },
    });
  });

  it("turns a missing email into a clarification case (Emil)", () => {
    expect(mapUtilityCustomer({ ...anna, email: null })).toMatchObject({
      ok: false,
      kind: "clarification",
      fields: ["email"],
    });
    expect(mapUtilityCustomer({ ...anna, email: null }, { email: "emil@example.org" }).ok).toBe(
      true,
    );
  });

  it("fails on malformed master data and unknown divisions", () => {
    expect(mapUtilityCustomer({ ...anna, plz: "" })).toMatchObject({
      kind: "failed",
      fields: ["postalCode"],
    });
    const heat = { ...anna, vertraege: anna.vertraege.map((v) => ({ ...v, sparte: "WAERME" })) };
    expect(mapUtilityCustomer(heat)).toMatchObject({ kind: "failed", code: "invalid-field" });
  });
});

describe("telco mapping", () => {
  it("maps Bernd with parsed address, name and German dates", () => {
    const mapped = mapTelcoSubscriber(bernd);
    expect(mapped).toMatchObject({
      ok: true,
      displayName: "Bernd Yilmaz",
      profile: {
        firstName: "Bernd",
        lastName: "Yilmaz",
        birthDate: "1979-11-02",
        address: { street: "Hauptstraße", houseNumber: "5", postalCode: "04103" },
      },
      contracts: [
        {
          division: "mobile",
          tariffOption: "20gb",
          monthlyInstallmentCent: 1999,
          dataVolumeMb: 20480,
          startDate: "2021-02-15",
        },
      ],
    });
    migrated(mapped);
  });

  it("makes an invalid mail a clarification and a missing postal code a failure", () => {
    expect(mapTelcoSubscriber({ ...bernd, mail: "helga.kraus@example" })).toMatchObject({
      kind: "clarification",
      code: "invalid-field",
    });
    const noPostalCode = { ...bernd, addressLine: "Gartenweg 3, Leipzig" };
    expect(mapTelcoSubscriber(noPostalCode)).toMatchObject({
      kind: "failed",
      fields: ["postalCode"],
    });
    expect(mapTelcoSubscriber(noPostalCode, { postalCode: "04229" }).ok).toBe(true);
  });
});

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("clients", () => {
  it("sends the utility API key and tenant and treats 401 as a wrong password", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { fehler: "x" }));
    const client = new UtilityClient({ baseUrl: "https://u", apiKey: "k", fetch: fetchMock });
    expect(await client.verifyLogin("owner", "a@example.org", "pw")).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://u/api/v1/anmeldung/pruefen");
    expect(init.headers).toMatchObject({ "x-api-key": "k", "x-mandant": "owner" });
  });

  it("reports a legacy outage instead of a wrong password", async () => {
    const down = new UtilityClient({
      baseUrl: "https://u",
      apiKey: "k",
      fetch: async () => jsonResponse(502, {}),
    });
    await expect(down.verifyLogin("owner", "a", "b")).rejects.toBeInstanceOf(
      LegacyUnavailableError,
    );
    const unreachable = new UtilityClient({
      baseUrl: "https://u",
      apiKey: "k",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(unreachable.getCustomer("owner", "V-1")).rejects.toBeInstanceOf(
      LegacyUnavailableError,
    );
  });

  it("encodes telco ids with a slash and uses the ApiKey scheme", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, bernd));
    const client = new TelcoClient({ baseUrl: "https://t", apiKey: "k", fetch: fetchMock });
    expect(await client.getSubscriber("owner", "T/88-4711")).toEqual(bernd);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://t/v2/subscribers/T%2F88-4711");
    expect(init.headers).toMatchObject({ authorization: "ApiKey k", "x-tenant": "owner" });
  });

  it("checks telco passwords at Keycloak and reads the subscriber id claim", async () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: "kc-1", subscriber_id: "T/88-4711" }),
    ).toString("base64url");
    const fetchMock = vi.fn(async () => jsonResponse(200, { access_token: `h.${payload}.s` }));
    const keycloak = new KeycloakPasswordCheck({
      issuer: "https://id.rypox.net/realms/telko",
      clientId: "c",
      clientSecret: "s",
      fetch: fetchMock,
    });
    expect(await keycloak.verify("b.yilmaz@example.net", "pw")).toEqual({
      sub: "kc-1",
      subscriber_id: "T/88-4711",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://id.rypox.net/realms/telko/protocol/openid-connect/token");
    expect(String(init.body)).toContain("grant_type=password");
  });

  it("distinguishes a wrong telco password from a misconfigured client", async () => {
    const check = (status: number, error: string) =>
      new KeycloakPasswordCheck({
        issuer: "https://kc/realms/telko",
        clientId: "c",
        clientSecret: "s",
        fetch: async () => jsonResponse(status, { error }),
      }).verify("u", "p");
    expect(await check(401, "invalid_grant")).toBeUndefined();
    await expect(check(401, "unauthorized_client")).rejects.toBeInstanceOf(LegacyUnavailableError);
  });
});
