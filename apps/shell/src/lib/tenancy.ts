import { config } from "./config";
import type { Session } from "./session";

/*
 * Demo-pass endpoints of the tenancy service. The typed client (`@kundenportal/api-contract`)
 * does not know them yet — the service and its OpenAPI part are built in parallel — so the
 * shapes are declared here and the calls use plain fetch. Replace with the generated types
 * once packages/api-contract/openapi.yaml contains /tenancy/*.
 */

export type QuotaKind = "api" | "events" | "uploads";
export interface Quota {
  used: number;
  limit: number;
}
export type PassStatus = "provisioning" | "active" | "quota-exceeded" | "tearing-down" | "deleted";

export interface PassView {
  tenantId: string;
  status: PassStatus;
  validUntil: string;
  quotas: Partial<Record<QuotaKind, Quota>>;
  demoPersons?: { name: string; login: string }[];
  demoPassword?: string;
}

/** Result of GET /tenancy/pass: the pass, "owner" (no pass) or an error. */
export type PassLookup =
  { kind: "pass"; pass: PassView } | { kind: "owner" } | { kind: "error"; status: number };

export const QUOTA_KINDS: readonly QuotaKind[] = ["api", "events", "uploads"];

const PASS_STATUSES = new Set<string>([
  "provisioning",
  "active",
  "quota-exceeded",
  "tearing-down",
  "deleted",
]);

/** GET /tenancy/pass as the contract (OwnPass in openapi.yaml) defines it. */
interface OwnPassResponse {
  tenantId?: unknown;
  status?: unknown;
  validUntil?: unknown;
  quota?: Partial<Record<QuotaKind, Quota>>;
  demoPersons?: { name: string; signIn: string }[];
  demoPassword?: unknown;
}

/** Interprets the response of GET /tenancy/pass; the owner tenant has no pass (404 or tenantId "owner"). */
export function toPassLookup(status: number, body: unknown): PassLookup {
  if (status === 404) return { kind: "owner" };
  if (status < 200 || status >= 300 || typeof body !== "object" || body === null) {
    return { kind: "error", status };
  }
  const value = body as OwnPassResponse;
  if (value.tenantId === "owner") return { kind: "owner" };
  if (typeof value.tenantId !== "string" || !PASS_STATUSES.has(String(value.status))) {
    return { kind: "error", status: 502 };
  }
  return {
    kind: "pass",
    pass: {
      tenantId: value.tenantId,
      status: value.status as PassStatus,
      validUntil: String(value.validUntil ?? ""),
      quotas: value.quota ?? {},
      ...(Array.isArray(value.demoPersons)
        ? {
            demoPersons: value.demoPersons.map((person) => ({
              name: person.name,
              login: person.signIn,
            })),
          }
        : {}),
      ...(typeof value.demoPassword === "string" ? { demoPassword: value.demoPassword } : {}),
    },
  };
}

/** GET /tenancy/pass with the session's access token (server side only). */
export async function fetchPass(session: Session): Promise<PassLookup> {
  try {
    const response = await fetch(`${config().apiUrl}/tenancy/pass`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    });
    const body: unknown = await response.json().catch(() => undefined);
    return toPassLookup(response.status, body);
  } catch {
    return { kind: "error", status: 502 };
  }
}

/** Calls a public (unauthenticated) tenancy endpoint of the API from the server. */
export function publicApi(path: "/tenancy/challenge" | "/tenancy/redeem", init?: RequestInit) {
  return fetch(`${config().apiUrl}${path}`, { ...init, cache: "no-store" });
}

const IPV4 = /^(\d{1,3})(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function validIp(value: string): string | undefined {
  const ip = value.trim();
  if (IPV4.test(ip) && ip.split(".").every((part) => Number(part) <= 255)) return ip;
  if (ip.includes(":") && IPV6.test(ip) && ip.length <= 39) return ip;
  return undefined;
}

/**
 * The visitor's IP for the redeem rate limit. The shell calls the API from its own Lambda,
 * so the API would otherwise see one address for all visitors. Preferred source is
 * CloudFront's `CloudFront-Viewer-Address` ("ip:port", set by CloudFront, not by the
 * viewer); otherwise the first `X-Forwarded-For` entry, which a visitor can forge — the
 * tenancy service therefore also limits per calling address.
 */
export function clientIp(headers: Headers): string | undefined {
  const viewer = headers.get("cloudfront-viewer-address");
  if (viewer) {
    const cut = viewer.lastIndexOf(":");
    const ip = validIp(cut > 0 ? viewer.slice(0, cut) : viewer);
    if (ip) return ip;
  }
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0];
  return forwarded ? validIp(forwarded) : undefined;
}

/** Replaces `{name}` placeholders in a translated text. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * Time left until `validUntil` in the largest sensible unit, rounded up: days while more
 * than a day is left, then hours, then minutes (short test passes run for minutes).
 */
export function timeLeft(
  validUntil: string,
  now = Date.now(),
): { unit: "days" | "hours" | "minutes"; value: number } {
  const end = Date.parse(validUntil);
  const ms = Number.isNaN(end) ? 0 : Math.max(0, end - now);
  if (ms > 86_400_000) return { unit: "days", value: Math.ceil(ms / 86_400_000) };
  if (ms > 3_600_000) return { unit: "hours", value: Math.ceil(ms / 3_600_000) };
  return { unit: "minutes", value: Math.ceil(ms / 60_000) };
}
