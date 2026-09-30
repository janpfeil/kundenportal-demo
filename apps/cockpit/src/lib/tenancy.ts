import {
  OWNER_GROUP,
  PASS_GROUP,
  type Session,
  groupsOf,
  zoneConfig,
} from "@kundenportal/web-auth";
import type { ApiResult } from "@kundenportal/web-auth";
import { type TenancySettings, parseSettings } from "./settings";

/*
 * Demo-pass administration of the tenancy service. The typed client
 * (`@kundenportal/api-contract`) does not know /tenancy/* yet — the service and its
 * OpenAPI part are built in parallel — so the shapes are declared here and the calls use
 * plain fetch. Replace with the generated types once openapi.yaml contains them.
 */

export type PassStatus = "provisioning" | "active" | "quota-exceeded" | "tearing-down" | "deleted";
export type QuotaKind = "api" | "events" | "uploads";

export interface PassSummary {
  passId: string;
  tenantId: string;
  email: string;
  status: PassStatus;
  validUntil: string;
  quotas: Partial<Record<QuotaKind, { used: number; limit: number }>>;
}

export interface Invitation {
  invitationId: string;
  link: string;
  expiresAt: string;
}

/** What the cockpit shows: owner (everything), pass holder (own tenant) or nothing. */
export type CockpitAccess = "owner" | "pass" | "none";

export function accessOf(session: Session): CockpitAccess {
  const groups = groupsOf(session.accessToken);
  if (groups.includes(OWNER_GROUP)) return "owner";
  if (groups.includes(PASS_GROUP)) return "pass";
  return "none";
}

/** Passes still running, which the owner may revoke. */
export function isRevocable(status: PassStatus): boolean {
  return status === "provisioning" || status === "active" || status === "quota-exceeded";
}

/** Calls a tenancy endpoint with the session's access token, shaped like an openapi-fetch result. */
export async function tenancyCall(
  session: Session,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  const response = await fetch(`${zoneConfig().apiUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  const json: unknown = await response.json().catch(() => undefined);
  return response.ok ? { data: json, response } : { error: json, response };
}

/** GET /tenancy/passes (owner only); undefined on any error. */
export async function listPasses(session: Session): Promise<PassSummary[] | undefined> {
  try {
    const { data, response } = await tenancyCall(session, "GET", "/tenancy/passes");
    if (!response.ok) return undefined;
    // Contract: `{ passes: PassSummary[] }` (listPasses in openapi.yaml).
    const items = (data as { passes?: unknown } | undefined)?.passes;
    if (!Array.isArray(items)) return undefined;
    // The contract names the usage `quota` (PassSummary in openapi.yaml).
    return (items as (Omit<PassSummary, "quotas"> & { quota?: PassSummary["quotas"] })[]).map(
      ({ quota, ...pass }) => ({ ...pass, quotas: quota ?? {} }),
    );
  } catch {
    return undefined;
  }
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;

/** Validates the invitation form: an e-mail address and optionally 1–60 test minutes. */
export function parseInvitation(
  body: unknown,
): { email: string; validMinutes?: number } | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { email, validMinutes } = body as { email?: unknown; validMinutes?: unknown };
  if (typeof email !== "string") return undefined;
  const address = email.trim();
  if (address.length > 254 || !EMAIL.test(address)) return undefined;
  if (validMinutes === undefined || validMinutes === null || validMinutes === "") {
    return { email: address };
  }
  const minutes = Number(validMinutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) return undefined;
  return { email: address, validMinutes: minutes };
}

/** GET /tenancy/settings (owner only); undefined on any error. */
export async function fetchSettings(session: Session): Promise<TenancySettings | undefined> {
  try {
    const { data, response } = await tenancyCall(session, "GET", "/tenancy/settings");
    return response.ok ? parseSettings(data) : undefined;
  } catch {
    return undefined;
  }
}
