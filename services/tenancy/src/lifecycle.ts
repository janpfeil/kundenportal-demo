import {
  type DemoPassIssuedDetail,
  DemoPassExpired,
  deterministicUuid,
  type PassEndReason,
  PassTenantId,
  QuotaExceeded,
  TenantDeleted,
  TenantProvisioned,
} from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import { type TenancyContext, tableNameOf } from "./context.js";
import { addDays, PASS_RECORD_DAYS, STUCK_AFTER_MS, type TenantStatus } from "./model.js";

const LIVE: TenantStatus[] = ["provisioning", "active", "quota-exceeded"];
const NOT_DELETED: TenantStatus[] = [...LIVE, "tearing-down"];

/**
 * Sets up the tenant of a new pass (on `DemoPassIssued`): own table, legacy data, the
 * holder's Cognito account, the expiry schedule; then `active` and `TenantProvisioned`.
 * Every step is idempotent, so a retry or the reconcile simply runs it again. A pass
 * that ended meanwhile stops the setup; the reconcile removes what was left.
 */
export async function provisionTenant(
  ctx: TenancyContext,
  detail: DemoPassIssuedDetail,
): Promise<void> {
  const { tenantId, passId } = detail.payload;
  const stillProvisioning = async () => {
    const tenant = await ctx.repository.getTenant(tenantId);
    return tenant?.passId === passId && tenant.status === "provisioning" ? tenant : undefined;
  };
  const tenant = await stillProvisioning();
  if (!tenant) {
    log("info", "Tenant is not waiting for provisioning", { tenantId, passId });
    return;
  }
  await ctx.tables.create(tenant.tableName, {
    "kundenportal:tenant": tenantId,
    "kundenportal:pass": passId,
  });
  if (!(await stillProvisioning())) return;
  await ctx.legacy.provision(tenantId, tenant.demoPassword);
  await ctx.accounts.createHolder(tenant.email, tenantId, tenant.shortLived === true);
  // A schedule in the past is rejected; the reconcile catches passes that ran out meanwhile.
  const now = ctx.now();
  const expiry = new Date(Math.max(Date.parse(tenant.validUntil), now.getTime() + 60_000));
  await ctx.schedules.create(tenantId, passId, expiry);

  if (!(await ctx.repository.setTenantStatus(tenantId, "active", ctx.now(), ["provisioning"]))) {
    return;
  }
  const pass = await ctx.repository.getPass(passId);
  if (pass) await ctx.repository.updatePass(pass, { status: "active" });
  const done = ctx.now();
  await ctx.events.publish(TenantProvisioned, {
    eventId: deterministicUuid("TenantProvisioned", passId),
    tenantId,
    occurredAt: done.toISOString(),
    correlationId: detail.correlationId,
    payload: {
      passId,
      tenantId,
      tableName: tenant.tableName,
      durationMs: Math.max(0, done.getTime() - Date.parse(tenant.createdAt)),
    },
  });
}

/**
 * Ends a pass (schedule, reconcile or the owner's revoke): marks the tenant for teardown
 * and publishes `DemoPassExpired`, whose handler tears it down. Returns false if the pass
 * is unknown or already gone.
 */
export async function endPass(
  ctx: TenancyContext,
  tenantId: string,
  passId: string,
  reason: PassEndReason,
  correlationId: string,
): Promise<boolean> {
  const tenant = await ctx.repository.getTenant(tenantId);
  if (!tenant || tenant.passId !== passId) return false;
  const now = ctx.now();
  if (!(await ctx.repository.setTenantStatus(tenantId, "tearing-down", now, NOT_DELETED))) {
    return false;
  }
  const pass = await ctx.repository.getPass(passId);
  if (pass && !pass.endReason) {
    await ctx.repository.updatePass(pass, {
      status: "tearing-down",
      endReason: reason,
      endedAt: now.toISOString(),
    });
  }
  await ctx.events.publish(DemoPassExpired, {
    eventId: deterministicUuid("DemoPassExpired", passId),
    tenantId,
    occurredAt: now.toISOString(),
    correlationId,
    payload: { passId, tenantId, reason: pass?.endReason ?? reason },
  });
  return true;
}

export interface TeardownResult {
  tenantId: string;
  deletedAccounts: number;
  deletedUploads: number;
  skipped?: true;
}

/**
 * Removes everything of one tenant (architektur-mandanten §7): Cognito accounts, legacy
 * data, uploads, table, schedule, counters; then the platform items go to `deleted`
 * (kept 30 days) and `TenantDeleted` follows. Each step skips what is already gone, so it
 * is safe to repeat, and it also works for orphans without platform items.
 */
export async function teardownTenant(
  ctx: TenancyContext,
  tenantId: string,
  correlationId = `teardown-${tenantId}`,
): Promise<TeardownResult> {
  const tenant = await ctx.repository.getTenant(tenantId);
  if (tenant?.status === "deleted")
    return { tenantId, deletedAccounts: 0, deletedUploads: 0, skipped: true };
  if (tenant)
    await ctx.repository.setTenantStatus(tenantId, "tearing-down", ctx.now(), NOT_DELETED);

  const deletedAccounts = await ctx.accounts.deleteTenantAccounts(tenantId);
  await ctx.legacy.remove(tenantId);
  const deletedUploads = await ctx.uploads.deleteAll(tenantId);
  await ctx.tables.delete(tableNameOf(ctx.config, tenantId));
  await ctx.schedules.delete(tenantId);
  await ctx.repository.deleteUsage(tenantId);

  if (tenant) {
    const now = ctx.now();
    const keepUntil = addDays(now, PASS_RECORD_DAYS);
    const deleted = await ctx.repository.setTenantStatus(
      tenantId,
      "deleted",
      now,
      NOT_DELETED,
      keepUntil,
    );
    const pass = await ctx.repository.getPass(tenant.passId);
    if (pass) {
      await ctx.repository.updatePass(
        pass,
        {
          status: "deleted",
          endReason: pass.endReason ?? "expired",
          endedAt: pass.endedAt ?? now.toISOString(),
        },
        keepUntil,
      );
    }
    if (deleted) {
      // Everything is gone at this point; a missing bus (app stack already removed by a
      // full teardown) must not fail the teardown itself.
      await ctx.events
        .publish(TenantDeleted, {
          eventId: deterministicUuid("TenantDeleted", tenant.passId),
          tenantId,
          occurredAt: now.toISOString(),
          correlationId,
          payload: { passId: tenant.passId, tenantId, deletedAccounts },
        })
        .catch((error: unknown) =>
          log("warn", "TenantDeleted could not be published", {
            tenantId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
    }
  }
  log("info", "Tenant torn down", { tenantId, deletedAccounts, deletedUploads });
  return { tenantId, deletedAccounts, deletedUploads };
}

async function tenantIdsWithTables(ctx: TenancyContext): Promise<string[]> {
  const names = await ctx.tables.list();
  return names
    .map((name) => name.slice(ctx.config.tablePrefix.length))
    .filter((id) => PassTenantId.safeParse(id).success);
}

export interface ReconcileResult {
  expired: string[];
  reprovisioned: string[];
  tornDown: string[];
}

/**
 * Daily safety net: ends passes past their date (e.g. a schedule that fired into a
 * paused stack), re-drives provisioning or teardown stuck for more than 10 minutes, and
 * removes orphaned tables without a live platform tenant.
 */
export async function reconcile(ctx: TenancyContext): Promise<ReconcileResult> {
  const now = ctx.now();
  const result: ReconcileResult = { expired: [], reprovisioned: [], tornDown: [] };
  const tenants = await ctx.repository.listTenants();
  const correlationId = `reconcile-${now.toISOString()}`;
  for (const tenant of tenants) {
    const idleMs = now.getTime() - Date.parse(tenant.updatedAt);
    try {
      if (LIVE.includes(tenant.status) && Date.parse(tenant.validUntil) <= now.getTime()) {
        if (await endPass(ctx, tenant.tenantId, tenant.passId, "expired", correlationId)) {
          result.expired.push(tenant.tenantId);
        }
      } else if (tenant.status === "provisioning" && idleMs > STUCK_AFTER_MS) {
        const pass = await ctx.repository.getPass(tenant.passId);
        if (!pass) continue;
        await provisionTenant(ctx, {
          eventId: deterministicUuid("DemoPassIssued", pass.passId),
          tenantId: tenant.tenantId,
          occurredAt: pass.issuedAt,
          correlationId,
          payload: {
            passId: pass.passId,
            tenantId: pass.tenantId,
            invitationId: pass.invitationId,
            email: pass.email,
            validUntil: pass.validUntil,
          },
        });
        result.reprovisioned.push(tenant.tenantId);
      } else if (tenant.status === "tearing-down" && idleMs > STUCK_AFTER_MS) {
        await teardownTenant(ctx, tenant.tenantId, correlationId);
        result.tornDown.push(tenant.tenantId);
      }
    } catch (error) {
      // One broken tenant must not block the others; the next run tries again.
      log("error", "Reconcile of a tenant failed", {
        tenantId: tenant.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const live = new Set(
    tenants.filter((tenant) => tenant.status !== "deleted").map((tenant) => tenant.tenantId),
  );
  for (const tenantId of await tenantIdsWithTables(ctx)) {
    if (live.has(tenantId)) continue;
    await teardownTenant(ctx, tenantId, correlationId);
    result.tornDown.push(tenantId);
  }
  return result;
}

/**
 * Tears down every pass tenant, live or orphaned (the base stack is being deleted).
 * Returns the tenants it removed.
 */
export async function teardownAllTenants(ctx: TenancyContext): Promise<string[]> {
  const ids = new Set(await tenantIdsWithTables(ctx));
  for (const tenant of await ctx.repository.listTenants()) {
    if (tenant.status !== "deleted") ids.add(tenant.tenantId);
  }
  for (const tenantId of ids) await teardownTenant(ctx, tenantId, "teardown-all");
  return [...ids];
}

/**
 * Counts a domain event of a pass tenant; the first event over the limit moves the
 * tenant to `quota-exceeded` (the API then answers 429) and publishes `QuotaExceeded`.
 */
export async function countEvent(
  ctx: TenancyContext,
  tenantId: string,
  correlationId: string,
): Promise<void> {
  const tenant = await ctx.repository.getTenant(tenantId);
  if (!tenant || !LIVE.includes(tenant.status)) return;
  const used = await ctx.repository.addUsage(tenantId, "events");
  const limit = ctx.config.quotas.events;
  if (used <= limit) return;
  const now = ctx.now();
  if (!(await ctx.repository.setTenantStatus(tenantId, "quota-exceeded", now, ["active"]))) {
    return;
  }
  await ctx.events.publish(QuotaExceeded, {
    eventId: deterministicUuid("QuotaExceeded", tenant.passId, "events"),
    tenantId,
    occurredAt: now.toISOString(),
    correlationId,
    payload: { passId: tenant.passId, tenantId, kind: "events", limit },
  });
}

/** Kill switch of the budget alarm: no further redemptions. */
export async function closeRedemption(ctx: TenancyContext, reason: string): Promise<void> {
  await ctx.repository.closeRedemption(ctx.now(), reason.slice(0, 500));
  log("warn", "Redemption of invitation links closed", { reason: reason.slice(0, 200) });
}
