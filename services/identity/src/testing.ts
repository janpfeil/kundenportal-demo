import { KeycloakPasswordCheck, TelcoClient, UtilityClient } from "@kundenportal/legacy";
import type { LegacyAccess } from "@kundenportal/legacy";

export const PASSWORD = "Altes-Passwort-1";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const annaKunde = {
  kundennummer: "V-1000123",
  anrede: "Frau",
  vorname: "Anna",
  nachname: "Becker",
  email: "anna.becker@example.org",
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
      tarif: "Strom Klassik",
      abschlag: "87.00",
      zaehlernummer: "1EMH0012345678",
      letzterZaehlerstand: { wert: 18234, ablesedatum: "2026-04-03" },
      beginn: "2019-04-01",
    },
  ],
};

export const emilKunde = { ...annaKunde, kundennummer: "V-1000125", vorname: "Emil", email: null };

export const carlaSubscriber = {
  subscriberId: "T/88-4712",
  name: "Schulz, Carla",
  mail: "carla.schulz@example.net",
  msisdn: "+49 151 5550202",
  addressLine: "Rosenstr. 18, 04109 Leipzig",
  dob: "23.07.1992",
  lastLoginAt: 1727000000,
  products: [
    {
      productId: "MOB-700118",
      type: "MOBILE",
      plan: "Mobil 10 GB",
      monthlyFee: 14.99,
      dataVolumeGb: 10,
      activeSince: "01.09.2018",
    },
  ],
};

/**
 * Legacy systems in memory: Anna (utility) and Carla (telco, Keycloak) accept PASSWORD;
 * `down` simulates an outage of both.
 */
export function fakeLegacy(options: { down?: boolean } = {}): LegacyAccess {
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    if (options.down) throw new TypeError("fetch failed");
    const url = new URL(String(input));
    const body = typeof init?.body === "string" ? init.body : "";
    if (url.pathname === "/api/v1/anmeldung/pruefen") {
      const { email, passwort } = JSON.parse(body) as { email: string; passwort: string };
      if (passwort !== PASSWORD) return json(401, { fehler: "x" });
      if (email === "anna.becker@example.org") return json(200, { kundennummer: "V-1000123" });
      return json(401, { fehler: "x" });
    }
    if (url.pathname === "/api/v1/kunden/V-1000123") return json(200, annaKunde);
    if (url.pathname === "/api/v1/kunden/V-1000125") return json(200, emilKunde);
    if (url.pathname === "/api/v1/kunden") {
      const email = url.searchParams.get("email");
      return json(200, { kunden: email === annaKunde.email ? [annaKunde] : [] });
    }
    if (url.pathname.endsWith("/protocol/openid-connect/token")) {
      const form = new URLSearchParams(body);
      if (form.get("username") !== carlaSubscriber.mail || form.get("password") !== PASSWORD) {
        return json(401, { error: "invalid_grant" });
      }
      const claims = { sub: "kc-carla", subscriber_id: "T/88-4712" };
      return json(200, {
        access_token: `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`,
      });
    }
    if (
      url.pathname === "/v2/subscribers/T/88-4712" ||
      url.pathname === "/v2/subscribers/T%2F88-4712"
    ) {
      return json(200, carlaSubscriber);
    }
    if (url.pathname === "/v2/subscribers") {
      const mail = url.searchParams.get("mail");
      return json(200, { items: mail === carlaSubscriber.mail ? [carlaSubscriber] : [] });
    }
    return json(404, {});
  }) as typeof fetch;
  return {
    utility: new UtilityClient({ baseUrl: "https://utility", apiKey: "k", fetch: fetchImpl }),
    telco: new TelcoClient({ baseUrl: "https://telco", apiKey: "k", fetch: fetchImpl }),
    keycloak: new KeycloakPasswordCheck({
      issuer: "https://kc/realms/telko",
      clientId: "c",
      clientSecret: "s",
      fetch: fetchImpl,
    }),
  };
}
