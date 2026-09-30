import { DemoPassIssued, deterministicUuid, InvitationCreated } from "@kundenportal/events";
import { type Caller, HttpError, notFound } from "@kundenportal/service-kit";
import { z } from "zod";
import { type TenancyContext, tableNameOf } from "./context.js";
import { endPass } from "./lifecycle.js";
import {
  addDays,
  addMinutes,
  INVITATION_DAYS,
  type Invitation,
  OWNER_TENANT,
  type Pass,
  type PlatformTenant,
  type QuotaUsage,
  type Settings,
  type TenantStatus,
} from "./model.js";
import { newDemoPassword, newInvitationToken, newTenantId, sha256 } from "./secrets.js";

export const InvitationRequest = z.strictObject({
  email: z.email().max(254),
  /** Short test pass (E2E): minutes instead of days, no Cognito mail. */
  validMinutes: z.number().int().min(1).max(60).optional(),
});
export type InvitationRequest = z.infer<typeof InvitationRequest>;

export const RedeemRequest = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "token is not an invitation token"),
  altcha: z.string().min(1).max(8192),
});
export type RedeemRequest = z.infer<typeof RedeemRequest>;

/** Demo persons of every tenant (legacy seeds); pass tenants sign in with a plus address. */
export const DEMO_PERSONS = [
  { name: "Anna Becker", system: "utility", email: "anna.becker@example.org" },
  { name: "Bernd Yilmaz", system: "utility", email: "bernd.yilmaz@example.org" },
  { name: "Bernd Yilmaz", system: "telco", email: "b.yilmaz@example.net" },
  { name: "Carla Schulz", system: "telco", email: "carla.schulz@example.net" },
] as const;

/** `anna.becker@example.org` → `anna.becker+p4k7x2qa@example.org`. */
export function plusAddress(email: string, tenantId: string): string {
  const at = email.lastIndexOf("@");
  return `${email.slice(0, at)}+${tenantId}${email.slice(at)}`;
}

const conflict = (detail: string) => new HttpError(409, "Conflict", detail);
const gone = (detail: string) => new HttpError(410, "Gone", detail);
const unavailable = (detail: string) => new HttpError(503, "Service Unavailable", detail);
const allInUse = () => unavailable("All demo instances are in use. Please try again later.");

/** Owner and pass-holder use cases of the API. */
export class Passes {
  constructor(private readonly ctx: TenancyContext) {}

  /** Creates an invitation link; only the SHA-256 of its token is stored. */
  async invite(owner: Caller, request: InvitationRequest, correlationId: string) {
    const now = this.ctx.now();
    const token = newInvitationToken();
    const email = request.email.toLowerCase();
    const shortLived = request.validMinutes !== undefined;
    const invitation: Invitation = {
      invitationId: this.ctx.newId(),
      email,
      createdAt: now.toISOString(),
      expiresAt: addDays(now, INVITATION_DAYS).toISOString(),
      createdBy: owner.subject,
      ...(shortLived
        ? {
            shortLived,
            validMinutes: Math.min(request.validMinutes ?? 60, this.ctx.config.maxShortMinutes),
          }
        : {}),
    };
    await this.ctx.repository.putInvitation(sha256(token), invitation);
    await this.ctx.events.publish(InvitationCreated, {
      eventId: deterministicUuid("InvitationCreated", invitation.invitationId),
      tenantId: owner.tenantId,
      occurredAt: invitation.createdAt,
      correlationId,
      payload: {
        invitationId: invitation.invitationId,
        email,
        expiresAt: invitation.expiresAt,
        createdBy: owner.subject,
      },
    });
    return {
      invitationId: invitation.invitationId,
      // In the fragment, so the token never reaches a server log.
      link: `${this.ctx.config.portalUrl}/pass/einloesen#${token}`,
      expiresAt: invitation.expiresAt,
    };
  }

  async usage(tenantId: string): Promise<QuotaUsage> {
    const used = await this.ctx.repository.getQuotaUsage(tenantId);
    const { quotas } = this.ctx.config;
    return {
      api: { used: used.api, limit: quotas.api },
      events: { used: used.events, limit: quotas.events },
      uploads: { used: used.uploads, limit: quotas.uploads },
    };
  }

  /** All passes for the owner's administration, newest first. */
  async list() {
    const tenants = await this.ctx.repository.listTenants();
    tenants.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Promise.all(
      tenants.map(async (tenant) => ({
        passId: tenant.passId,
        tenantId: tenant.tenantId,
        email: tenant.email,
        status: tenant.status,
        createdAt: tenant.createdAt,
        validUntil: tenant.validUntil,
        shortLived: tenant.shortLived === true,
        quota: tenant.status === "deleted" ? undefined : await this.usage(tenant.tenantId),
      })),
    );
  }

  /** The owner ends a pass early; the teardown follows asynchronously. */
  async revoke(passId: string, correlationId: string) {
    const pass = await this.ctx.repository.getPass(passId);
    if (!pass) throw notFound("No such pass");
    const tenant = await this.ctx.repository.getTenant(pass.tenantId);
    if (!tenant || tenant.status === "deleted" || tenant.status === "tearing-down") {
      throw conflict("The pass has already ended");
    }
    await endPass(this.ctx, pass.tenantId, passId, "revoked", correlationId);
    return { passId, tenantId: pass.tenantId, status: "tearing-down" satisfies TenantStatus };
  }

  /**
   * The caller's own pass (tenant from the token). Demo persons see status and quota;
   * the pass holder and the owner also the sign-in names and the demo password.
   */
  async own(caller: Caller, privileged: boolean) {
    if (caller.tenantId === OWNER_TENANT) return { tenantId: OWNER_TENANT, status: "owner" };
    const tenant = await this.ctx.repository.getTenant(caller.tenantId);
    if (!tenant) throw notFound("No pass for this tenant");
    return {
      tenantId: tenant.tenantId,
      passId: tenant.passId,
      status: tenant.status,
      validUntil: tenant.validUntil,
      quota: await this.usage(tenant.tenantId),
      ...(privileged && tenant.status !== "deleted"
        ? {
            demoPassword: tenant.demoPassword,
            demoPersons: DEMO_PERSONS.map((person) => ({
              name: person.name,
              system: person.system,
              signIn: plusAddress(person.email, tenant.tenantId),
            })),
          }
        : {}),
    };
  }

  /**
   * Redeems an invitation (after rate limit and ALTCHA, see the public API): kill switch,
   * cap of concurrent tenants, one pass per address; then pass and tenant in one
   * transaction and `DemoPassIssued` for the provisioning.
   */
  async redeem(token: string, correlationId: string) {
    const { repository, config } = this.ctx;
    const settings = await repository.getSettings();
    if (settings.redemption === "closed") {
      throw unavailable("Redeeming invitations is paused. Please try again later.");
    }
    const tokenHash = sha256(token);
    const invitation = await repository.getInvitation(tokenHash);
    const now = this.ctx.now();
    if (!invitation) throw notFound("Unknown invitation link");
    if (invitation.redeemedAt) throw conflict("The invitation link has already been used");
    if (Date.parse(invitation.expiresAt) <= now.getTime()) {
      throw gone("The invitation link has expired");
    }
    // Fast refusal only; the transaction below enforces the cap atomically.
    if ((await this.activeTenants(settings)) >= settings.maxTenants) throw allInUse();
    if (await repository.hasPassFor(invitation.email)) {
      throw conflict("This address already has a demo pass");
    }
    if (await this.ctx.accounts.exists(invitation.email)) {
      throw conflict("This address already has a portal account");
    }

    const tenantId = newTenantId();
    const passId = this.ctx.newId();
    const validUntil = invitation.shortLived
      ? addMinutes(now, invitation.validMinutes ?? config.maxShortMinutes)
      : addDays(now, config.passDays);
    const flags = invitation.shortLived ? { shortLived: true } : {};
    const pass: Pass = {
      passId,
      tenantId,
      invitationId: invitation.invitationId,
      email: invitation.email,
      issuedAt: now.toISOString(),
      validUntil: validUntil.toISOString(),
      status: "provisioning",
      ...flags,
    };
    const tenant: PlatformTenant = {
      tenantId,
      passId,
      email: invitation.email,
      tableName: tableNameOf(config, tenantId),
      status: "provisioning",
      validUntil: pass.validUntil,
      createdAt: pass.issuedAt,
      updatedAt: pass.issuedAt,
      demoPassword: newDemoPassword(),
      ...flags,
    };
    const issued = await repository.issuePass(tokenHash, now, pass, tenant, settings.maxTenants);
    if (issued === "invitation-gone") throw conflict("The invitation link has already been used");
    if (issued === "email-taken") throw conflict("This address already has a demo pass");
    if (issued === "tenants-full") throw allInUse();

    await this.ctx.events.publish(DemoPassIssued, {
      eventId: deterministicUuid("DemoPassIssued", passId),
      tenantId,
      occurredAt: pass.issuedAt,
      correlationId,
      payload: {
        passId,
        tenantId,
        invitationId: invitation.invitationId,
        email: invitation.email,
        validUntil: pass.validUntil,
      },
    });
    return { passId, statusUrl: `${config.portalUrl}/pass` };
  }

  /**
   * The counter of tenants that are not deleted. Before the first redeem with the counter
   * it is missing; then it is seeded from the tenant items (only if still missing).
   */
  private async activeTenants(settings: Settings): Promise<number> {
    if (settings.activeTenants !== undefined) return settings.activeTenants;
    const live = (await this.ctx.repository.listTenants()).filter((t) => t.status !== "deleted");
    await this.ctx.repository.setActiveTenants(live.length, undefined);
    return live.length;
  }
}
