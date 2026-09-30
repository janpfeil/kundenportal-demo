/*
 * Demo-pass settings as the owner sees and changes them. Free of server APIs: the settings
 * panel (a client component) and the route handler both use these.
 */

/** Platform settings of the demo passes (getSettings/updateSettings in openapi.yaml). */
export interface TenancySettings {
  redemption: "open" | "closed";
  /** When and why redemption was closed; only while closed (e.g. the budget alarm). */
  closedAt?: string;
  closedReason?: string;
  /** Cap of concurrent pass tenants (1–4, free DynamoDB capacity). */
  maxTenants: number;
  activeTenants: number;
}

export interface SettingsUpdate {
  redemption?: "open" | "closed";
  maxTenants?: number;
}

/** Bounds of the cap: each pass tenant has its own table with 5 RCU/5 WCU of the free 25/25. */
export const MIN_TENANTS = 1;
export const MAX_TENANTS = 4;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Validates GET/PUT /tenancy/settings; undefined if the answer has another shape. */
export function parseSettings(body: unknown): TenancySettings | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { redemption, closedAt, closedReason, maxTenants, activeTenants } = body as Record<
    string,
    unknown
  >;
  if (redemption !== "open" && redemption !== "closed") return undefined;
  if (!isCount(maxTenants) || !isCount(activeTenants)) return undefined;
  return {
    redemption,
    maxTenants,
    activeTenants,
    ...(typeof closedAt === "string" ? { closedAt } : {}),
    ...(typeof closedReason === "string" ? { closedReason } : {}),
  };
}

/** Validates the settings form: redemption open/closed and/or a cap of 1–4, nothing else. */
export function parseSettingsUpdate(body: unknown): SettingsUpdate | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return undefined;
  const update: SettingsUpdate = {};
  for (const [key, value] of entries) {
    if (key === "redemption" && (value === "open" || value === "closed")) update.redemption = value;
    else if (
      key === "maxTenants" &&
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= MIN_TENANTS &&
      value <= MAX_TENANTS
    )
      update.maxTenants = value;
    else return undefined;
  }
  return update;
}
