import type { Division, LegacyContract } from "@kundenportal/events";
import { z } from "zod";
import { callJson, type Fetch, LegacyUnavailableError } from "./http.js";
import type { Corrections, MappingResult } from "./mapped.js";
import { expandStreet, germanDateToIso, parseAddressLine, toCents } from "./normalize.js";

/** Subscriber of the telco's legacy system (`telko.openapi.yaml`, schema `Subscriber`). */
export const Subscriber = z.object({
  subscriberId: z.string(),
  name: z.string(),
  mail: z.string(),
  msisdn: z.string().nullable(),
  addressLine: z.string(),
  dob: z.string(),
  lastLoginAt: z.number(),
  products: z.array(
    z.object({
      productId: z.string(),
      type: z.string(),
      plan: z.string(),
      monthlyFee: z.number(),
      dataVolumeGb: z.number().nullable(),
      activeSince: z.string(),
    }),
  ),
});
export type Subscriber = z.infer<typeof Subscriber>;

const ExportSlice = z.object({
  total: z.number(),
  offset: z.number(),
  nextOffset: z.number().nullable(),
  items: z.array(Subscriber.extend({ pwdSalt: z.string(), pwdHash: z.string() })),
});

export interface TelcoClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: Fetch;
  timeoutMs?: number;
}

/** REST client of the telco's legacy system. */
export class TelcoClient {
  private readonly fetchImpl: Fetch;

  constructor(private readonly options: TelcoClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  private request(tenant: string, path: string) {
    return callJson(this.fetchImpl, `${this.options.baseUrl}${path}`, {
      timeoutMs: this.options.timeoutMs ?? 3000,
      headers: { authorization: `ApiKey ${this.options.apiKey}`, "x-tenant": tenant },
    });
  }

  async getSubscriber(tenant: string, subscriberId: string): Promise<Subscriber | undefined> {
    const { status, body } = await this.request(
      tenant,
      `/v2/subscribers/${encodeURIComponent(subscriberId)}`,
    );
    if (status === 404) return undefined;
    const parsed = Subscriber.safeParse(body);
    if (status !== 200 || !parsed.success) throw new LegacyUnavailableError(`read: HTTP ${status}`);
    return parsed.data;
  }

  async findByMail(tenant: string, mail: string): Promise<Subscriber | undefined> {
    const { status, body } = await this.request(
      tenant,
      `/v2/subscribers?mail=${encodeURIComponent(mail)}`,
    );
    const parsed = z.object({ items: z.array(Subscriber) }).safeParse(body);
    if (status !== 200 || !parsed.success) throw new LegacyUnavailableError(`find: HTTP ${status}`);
    return parsed.data.items[0];
  }

  async exportSlice(tenant: string, offset: number, limit: number) {
    const { status, body } = await this.request(
      tenant,
      `/v2/subscribers/export?offset=${offset}&limit=${limit}`,
    );
    const parsed = ExportSlice.safeParse(body);
    if (status !== 200 || !parsed.success)
      throw new LegacyUnavailableError(`export: HTTP ${status}`);
    return parsed.data;
  }
}

/** Legacy plans → portal division and tariff option (contract domain catalogue). */
const PLANS: Record<string, { division: Division; tariffOption: string }> = {
  "DSL 100": { division: "internet", tariffOption: "100" },
  "DSL 250": { division: "internet", tariffOption: "250" },
  "Glasfaser 1000": { division: "internet", tariffOption: "1000" },
  "Mobil 10 GB": { division: "mobile", tariffOption: "10gb" },
  "Mobil 20 GB": { division: "mobile", tariffOption: "20gb" },
  "Mobil 40 GB": { division: "mobile", tariffOption: "40gb" },
};

const Email = z.email();

/** Maps a telco subscriber to the portal's terms, applying operator corrections first. */
export function mapTelcoSubscriber(
  subscriber: Subscriber,
  corrections: Corrections = {},
): MappingResult {
  const account = { system: "telco", customerNumber: subscriber.subscriberId } as const;
  const [lastName = "", firstName = ""] = subscriber.name.split(",").map((part) => part.trim());
  const displayName = `${firstName} ${lastName}`.trim() || subscriber.name;
  const lastSignInAt = new Date(subscriber.lastLoginAt * 1000).toISOString();
  const base = { account, displayName, lastSignInAt };
  const email = (corrections.email ?? subscriber.mail).trim();
  if (!email || !Email.safeParse(email).success) {
    return {
      ok: false,
      ...base,
      kind: "clarification",
      code: email ? "invalid-field" : "missing-required-field",
      message: email ? `Invalid email address "${email}"` : "No email address in the legacy system",
      fields: ["email"],
    };
  }
  const parsed = parseAddressLine(subscriber.addressLine);
  const address = {
    street: corrections.street ? expandStreet(corrections.street) : (parsed.street ?? ""),
    houseNumber: (corrections.houseNumber ?? parsed.houseNumber ?? "").trim(),
    postalCode: (corrections.postalCode ?? parsed.postalCode ?? "").trim(),
    city: (corrections.city ?? parsed.city ?? "").trim(),
  };
  const missing = [
    ...(!firstName ? ["firstName"] : []),
    ...(!lastName ? ["lastName"] : []),
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
  for (const product of subscriber.products) {
    const plan = PLANS[product.plan];
    const startDate = germanDateToIso(product.activeSince);
    if (!plan || !startDate) {
      return {
        ok: false,
        ...base,
        kind: "failed",
        code: "invalid-field",
        message: `Unknown plan or start date in product ${product.productId}`,
        fields: [plan ? "activeSince" : "plan"],
      };
    }
    contracts.push({
      legacyContractId: product.productId,
      division: plan.division,
      tariffOption: plan.tariffOption,
      monthlyInstallmentCent: toCents(product.monthlyFee),
      ...(product.dataVolumeGb ? { dataVolumeMb: product.dataVolumeGb * 1024 } : {}),
      startDate,
    });
  }

  const birthDate = germanDateToIso(subscriber.dob);
  return {
    ok: true,
    account,
    email: email.toLowerCase(),
    displayName,
    profile: {
      firstName,
      lastName,
      address,
      ...(subscriber.msisdn ? { phone: subscriber.msisdn } : {}),
      ...(birthDate ? { birthDate } : {}),
    },
    contracts,
    lastSignInAt,
  };
}
