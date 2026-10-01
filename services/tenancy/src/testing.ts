import type { QuotaKind } from "@kundenportal/events";
import type { z } from "zod";
import type { Repository, TenancyContext } from "./context.js";
import {
  type Invitation,
  type InvitationIndexEntry,
  OWNER_CLOSED_REASON,
  type Pass,
  type PlatformTenant,
  type Settings,
  type SettingsChange,
  type TenancyConfig,
  type TenantStatus,
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
  /** `PLATFORM` / `INVITE#<invitationId>` entries by invitation id. */
  invitationIndex = new Map<string, InvitationIndexEntry>();
  /** API calls per `tenantId|YYYY-MM-DD` (the quota guard's day counters). */
  apiDays = new Map<string, number>();

  async putInvitation(hash: string, invitation: Invitation) {
    if (this.invitations.has(hash)) throw new Error("exists");
    this.invitations.set(hash, structuredClone(invitation));
    this.invitationIndex.set(invitation.invitationId, {
      invitationId: invitation.invitationId,
      email: invitation.email,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      shortLived: invitation.shortLived === true,
    });
  }
  async getInvitation(hash: string) {
    return structuredClone(this.invitations.get(hash));
  }
  async listOpenInvitations(now: Date) {
    return [...this.invitationIndex.values()]
      .filter((entry) => Date.parse(entry.expiresAt) > now.getTime())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((entry) => structuredClone(entry));
  }
  async getApiCalls(tenantId: string, dates: string[]) {
    return Object.fromEntries(
      dates.map((date) => [date, this.apiDays.get(`${tenantId}|${date}`) ?? 0]),
    );
  }
  /** All conditions checked and all items written without an await: one transaction. */
  async issuePass(hash: string, now: Date, pass: Pass, tenant: PlatformTenant, maxTenants: number) {
    const invitation = this.invitations.get(hash);
    if (!invitation || invitation.redeemedAt || invitation.expiresAt <= now.toISOString()) {
      return "invitation-gone" satisfies IssueResult;
    }
    if (this.emails.has(pass.email)) return "email-taken" satisfies IssueResult;
    const active = this.settings.activeTenants;
    if (active !== undefined && active >= maxTenants) return "tenants-full" satisfies IssueResult;
    this.settings.activeTenants = (active ?? 0) + 1;
    invitation.redeemedAt = now.toISOString();
    invitation.passId = pass.passId;
    this.invitationIndex.delete(pass.invitationId);
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
  async activateTenant(tenant: PlatformTenant, now: Date, validUntil?: Date) {
    const stored = this.tenants.get(tenant.tenantId);
    const pass = this.passes.get(tenant.passId);
    const live: TenantStatus[] = ["provisioning", "active", "quota-exceeded"];
    if (!stored || !pass || stored.activatedAt || stored.passId !== tenant.passId) return false;
    if (!live.includes(stored.status)) return false;
    for (const item of [stored, pass]) {
      item.activatedAt = now.toISOString();
      if (validUntil) item.validUntil = validUntil.toISOString();
    }
    return true;
  }
  async markReminderSent(tenantId: string, now: Date, release = false) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;
    if (release) {
      if (tenant.reminderSentAt !== now.toISOString()) return false;
      delete tenant.reminderSentAt;
      return true;
    }
    if (tenant.reminderSentAt || tenant.status !== "active") return false;
    tenant.reminderSentAt = now.toISOString();
    return true;
  }
  async markTenantDeleted(tenantId: string, now: Date, keepUntil: Date) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant || tenant.status === "deleted") return false;
    tenant.status = "deleted";
    tenant.updatedAt = now.toISOString();
    tenant.ttl = Math.floor(keepUntil.getTime() / 1000);
    const active = this.settings.activeTenants;
    if (active !== undefined && active > 0) this.settings.activeTenants = active - 1;
    return true;
  }
  async setActiveTenants(count: number, seen: number | undefined) {
    if (this.settings.activeTenants !== seen) return false;
    this.settings.activeTenants = count;
    return true;
  }
  async getSettings(): Promise<Settings> {
    return { redemption: "open", maxTenants: 3, ...structuredClone(this.settings) };
  }
  async updateSettings(change: SettingsChange, now: Date) {
    if (change.maxTenants !== undefined) this.settings.maxTenants = change.maxTenants;
    if (change.redemption === "open") {
      this.settings.redemption = "open";
      delete this.settings.closedAt;
      delete this.settings.closedReason;
    } else if (change.redemption === "closed") {
      this.settings.redemption = "closed";
      this.settings.closedAt ??= now.toISOString();
      this.settings.closedReason ??= OWNER_CLOSED_REASON;
    }
    return this.getSettings();
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
  readonly lastActivity = new Map<string, string>();
  async getLastActivity(tenantId: string) {
    return this.lastActivity.get(tenantId);
  }
  async addUsage(tenantId: string, kind: QuotaKind) {
    const key = `${tenantId}|${kind}`;
    const used = (this.usage.get(key) ?? 0) + 1;
    this.usage.set(key, used);
    return used;
  }
  async deleteUsage(tenantId: string) {
    for (const map of [this.usage, this.apiDays]) {
      for (const key of [...map.keys()]) {
        if (key.startsWith(`${tenantId}|`)) map.delete(key);
      }
    }
  }
}

export const CONFIG: TenancyConfig = {
  portalUrl: "https://portal.example.org",
  tablePrefix: "kp-tenant-",
  passHours: 48,
  reminderHours: 24,
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
  const accounts = new Map<
    string,
    { tenantId: string; suppressMail: boolean; status?: string; invitations?: number }
  >();
  const legacyTenants = new Map<string, string>();
  const schedules = new Map<string, { passId: string; at: Date }>();
  const reminders = new Map<string, { passId: string; at: Date }>();
  const uploads = new Map<string, number>();
  const hints: { subject: string; message: string }[] = [];
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
      async holderStatus(email) {
        const account = accounts.get(email);
        return account ? (account.status ?? "FORCE_CHANGE_PASSWORD") : undefined;
      },
      async resendInvitation(email) {
        calls.push(`account:resend:${email}`);
        const account = accounts.get(email);
        if (!account) throw new Error("no account");
        account.invitations = (account.invitations ?? 1) + 1;
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
      async moveExpiry(tenantId, passId, at) {
        calls.push(`schedule:move:${tenantId}`);
        schedules.set(tenantId, { passId, at });
      },
      async createReminder(tenantId, passId, at) {
        calls.push(`reminder:create:${tenantId}`);
        reminders.set(tenantId, { passId, at });
      },
      async delete(tenantId) {
        calls.push(`schedule:delete:${tenantId}`);
        schedules.delete(tenantId);
        reminders.delete(tenantId);
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
    ownerHints: {
      async send(subject, message) {
        hints.push({ subject, message });
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
    reminders,
    uploads,
    hints,
    types: () => published.map((p) => p.detailType),
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
  };
}
