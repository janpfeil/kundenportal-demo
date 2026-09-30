import type { QuotaKind } from "@kundenportal/events";
import type { z } from "zod";
import type { Repository, TenancyContext } from "./context.js";
import type {
  Invitation,
  Pass,
  PlatformTenant,
  Settings,
  TenancyConfig,
  TenantStatus,
} from "./model.js";
import type { IssueResult } from "./repository.js";

export const NOW = new Date("2026-09-30T12:00:00.000Z");

/** The tenancy repository in memory, with the same semantics as the DynamoDB one. */
export class MemoryRepository implements Repository {
  invitations = new Map<string, Invitation>();
  passes = new Map<string, Pass & { ttl?: number }>();
  tenants = new Map<string, PlatformTenant & { ttl?: number }>();
  emails = new Set<string>();
  settings: Partial<Settings> = {};
  attempts = new Map<string, number>();
  challenges = new Set<string>();
  usage = new Map<string, number>();

  async putInvitation(hash: string, invitation: Invitation) {
    if (this.invitations.has(hash)) throw new Error("exists");
    this.invitations.set(hash, structuredClone(invitation));
  }
  async getInvitation(hash: string) {
    return structuredClone(this.invitations.get(hash));
  }
  async issuePass(hash: string, now: Date, pass: Pass, tenant: PlatformTenant) {
    const invitation = this.invitations.get(hash);
    if (!invitation || invitation.redeemedAt || invitation.expiresAt <= now.toISOString()) {
      return "invitation-gone" satisfies IssueResult;
    }
    if (this.emails.has(pass.email)) return "email-taken" satisfies IssueResult;
    invitation.redeemedAt = now.toISOString();
    invitation.passId = pass.passId;
    this.passes.set(pass.passId, structuredClone(pass));
    this.tenants.set(tenant.tenantId, structuredClone(tenant));
    this.emails.add(pass.email);
    return "issued" satisfies IssueResult;
  }
  async hasPassFor(email: string) {
    return this.emails.has(email.toLowerCase());
  }
  async getPass(passId: string) {
    const pass = this.passes.get(passId);
    if (!pass) return undefined;
    const { ttl: _ttl, ...rest } = structuredClone(pass);
    return rest;
  }
  async updatePass(pass: Pass, fields: Partial<Pass>, keepUntil?: Date) {
    const stored = this.passes.get(pass.passId);
    if (!stored) throw new Error("no pass");
    Object.assign(stored, fields);
    if (keepUntil) stored.ttl = Math.floor(keepUntil.getTime() / 1000);
  }
  async getTenant(tenantId: string) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return undefined;
    const { ttl: _ttl, ...rest } = structuredClone(tenant);
    return rest;
  }
  async listTenants() {
    return [...this.tenants.keys()].sort().map((id) => {
      const { ttl: _ttl, ...rest } = structuredClone(
        this.tenants.get(id) as PlatformTenant & { ttl?: number },
      );
      return rest;
    });
  }
  async setTenantStatus(
    tenantId: string,
    status: TenantStatus,
    now: Date,
    from?: TenantStatus[],
    keepUntil?: Date,
  ) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant || (from && !from.includes(tenant.status))) return false;
    tenant.status = status;
    tenant.updatedAt = now.toISOString();
    if (keepUntil) tenant.ttl = Math.floor(keepUntil.getTime() / 1000);
    return true;
  }
  async getSettings(): Promise<Settings> {
    return { redemption: "open", maxTenants: 3, ...this.settings };
  }
  async closeRedemption(now: Date, reason: string) {
    this.settings = {
      ...this.settings,
      redemption: "closed",
      closedAt: now.toISOString(),
      closedReason: reason,
    };
  }
  async countAttempt(key: string, limit: number) {
    const used = this.attempts.get(key) ?? 0;
    if (used >= limit) return false;
    this.attempts.set(key, used + 1);
    return true;
  }
  async useChallenge(signature: string) {
    if (this.challenges.has(signature)) return false;
    this.challenges.add(signature);
    return true;
  }
  async getQuotaUsage(tenantId: string) {
    const get = (kind: QuotaKind) => this.usage.get(`${tenantId}|${kind}`) ?? 0;
    return { api: get("api"), events: get("events"), uploads: get("uploads") };
  }
  async addUsage(tenantId: string, kind: QuotaKind) {
    const key = `${tenantId}|${kind}`;
    const used = (this.usage.get(key) ?? 0) + 1;
    this.usage.set(key, used);
    return used;
  }
  async deleteUsage(tenantId: string) {
    for (const key of [...this.usage.keys()]) {
      if (key.startsWith(`${tenantId}|`)) this.usage.delete(key);
    }
  }
}

export const CONFIG: TenancyConfig = {
  portalUrl: "https://portal.example.org",
  tablePrefix: "kp-tenant-",
  passDays: 7,
  maxShortMinutes: 60,
  quotas: { api: 5000, events: 3, uploads: 20 },
  redeemPerClient: 10,
  redeemPerSource: 100,
};

/** A context with in-memory fakes that record what the lifecycle did. */
export function testContext(overrides: Partial<TenancyContext> = {}) {
  const repository = new MemoryRepository();
  const published: { detailType: string; detail: Record<string, unknown> }[] = [];
  const calls: string[] = [];
  const tables = new Set<string>();
  const accounts = new Map<string, { tenantId: string; suppressMail: boolean }>();
  const legacyTenants = new Map<string, string>();
  const schedules = new Map<string, { passId: string; at: Date }>();
  const uploads = new Map<string, number>();
  let clock = NOW;
  let ids = 0;
  const ctx: TenancyContext = {
    repository,
    events: {
      async publish<T extends z.ZodType>(
        event: { detailType: string; detail: T },
        detail: z.input<T>,
      ) {
        published.push({
          detailType: event.detailType,
          detail: event.detail.parse(detail) as Record<string, unknown>,
        });
      },
    },
    tables: {
      async create(name) {
        calls.push(`table:create:${name}`);
        tables.add(name);
      },
      async delete(name) {
        calls.push(`table:delete:${name}`);
        tables.delete(name);
      },
      async list() {
        return [...tables];
      },
    },
    accounts: {
      async exists(email) {
        return [...accounts.keys()].includes(email);
      },
      async createHolder(email, tenantId, suppressMail) {
        calls.push(`account:create:${email}`);
        accounts.set(email, { tenantId, suppressMail });
      },
      async deleteTenantAccounts(tenantId) {
        let deleted = 0;
        for (const [email, account] of accounts) {
          if (account.tenantId === tenantId) {
            accounts.delete(email);
            deleted++;
          }
        }
        calls.push(`account:delete:${tenantId}`);
        return deleted;
      },
    },
    legacy: {
      async provision(tenantId, password) {
        calls.push(`legacy:provision:${tenantId}`);
        legacyTenants.set(tenantId, password);
      },
      async remove(tenantId) {
        calls.push(`legacy:remove:${tenantId}`);
        legacyTenants.delete(tenantId);
      },
    },
    schedules: {
      async create(tenantId, passId, at) {
        calls.push(`schedule:create:${tenantId}`);
        schedules.set(tenantId, { passId, at });
      },
      async delete(tenantId) {
        calls.push(`schedule:delete:${tenantId}`);
        schedules.delete(tenantId);
      },
    },
    uploads: {
      async deleteAll(tenantId) {
        calls.push(`uploads:delete:${tenantId}`);
        const count = uploads.get(tenantId) ?? 0;
        uploads.delete(tenantId);
        return count;
      },
    },
    config: CONFIG,
    now: () => clock,
    newId: () => `id-${++ids}`,
    ...overrides,
  };
  return {
    ctx,
    repository,
    published,
    calls,
    tables,
    accounts,
    legacyTenants,
    schedules,
    uploads,
    types: () => published.map((p) => p.detailType),
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
  };
}
