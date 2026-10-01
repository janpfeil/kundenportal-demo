import type { components } from "@kundenportal/api-contract";

/**
 * What a demo pass currently offers, from the public `GET /api/tenancy/offer` (getOffer in
 * openapi.yaml). The redeem page is prerendered and cached at the edge, so the browser
 * fetches these values itself: same origin (CloudFront routes /api/* to the HTTP API), no
 * token, no request through the shell's Lambda.
 */
export const OFFER_URL = "/api/tenancy/offer";

/**
 * PassOffer of the contract. `redemptionOpen` is false while the kill switch is closed or
 * all places are taken; redeeming would then give 503.
 */
export type Offer = components["schemas"]["PassOffer"];

const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Validates the API's answer; `undefined` if it does not have the expected shape. */
export function parseOffer(body: unknown): Offer | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { passHours, quotas, uploadMaxBytes, redemptionOpen } = body as Record<string, unknown>;
  if (!count(passHours) || !count(uploadMaxBytes) || typeof redemptionOpen !== "boolean")
    return undefined;
  if (typeof quotas !== "object" || quotas === null) return undefined;
  const { api, events, uploads } = quotas as Record<string, unknown>;
  if (!count(api) || !count(events) || !count(uploads)) return undefined;
  return { passHours, quotas: { api, events, uploads }, uploadMaxBytes, redemptionOpen };
}

/** Loads the offer; `undefined` on any failure (the page then shows no numbers). */
export async function fetchOffer(signal?: AbortSignal): Promise<Offer | undefined> {
  try {
    const response = await fetch(OFFER_URL, {
      headers: { accept: "application/json" },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return undefined;
    return parseOffer(await response.json());
  } catch {
    return undefined;
  }
}
