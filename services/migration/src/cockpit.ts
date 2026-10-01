import {
  customerIdFor,
  EventBridgeEnvelope,
  type LegacySystem,
  MAX_REMOVED_ACCOUNTS_PER_EVENT,
  MigratedAccountsRemoved,
} from "@kundenportal/events";
import { type Caller, HttpError, log, notFound, OWNER_TENANT } from "@kundenportal/service-kit";
import { legacyTotal, type MigrationContext } from "./context.js";
import {
  accountFromRecordId,
  Corrections,
  type MigrationRecord,
  type MigrationRun,
  RecordStatus,
  recordId,
  refString,
  type TimelineEntry,
} from "./model.js";
import { matchRecords, matchTimeline, SEARCH_TIMELINE_ENTRIES, searchQuery } from "./search.js";
import { type MigrationTrends, migratedToday, migrationTrends } from "./trends.js";

/** Cockpit view of one record (clarification case, dead letter, search hit). */
export interface RecordView {
  id: string;
  system: LegacySystem;
  customerNumber: string;
  displayName: string;
  status: RecordStatus;
  code?: string;
  message?: string;
  fields?: string[];
  attempts: number;
  updatedAt: string;
}

export interface MigrationStatus {
  systems: {
    system: LegacySystem;
    /** Records in the legacy system; missing while it is unreachable. */
    total?: number;
    counts: Record<RecordStatus, number>;
    /** Records migrated or linked since 00:00 German time. */
    migratedToday: number;
  }[];
  clarifications: RecordView[];
  deadLetters: RecordView[];
  runs: MigrationRun[];
  timeline: TimelineEntry[];
  trends: MigrationTrends;
}

/** `GET /migration/search` (`MigrationSearchResult` in the contract). */
export interface MigrationSearchResult {
  query: string;
  accounts: RecordView[];
  events: TimelineEntry[];
}

function view(record: MigrationRecord): RecordView {
  return {
    id: recordId(record.account),
    system: record.account.system,
    customerNumber: record.account.customerNumber,
    displayName: record.displayName,
    status: record.status,
    ...(record.problem
      ? {
          code: record.problem.code,
          message: record.problem.message,
          fields: record.problem.fields,
        }
      : {}),
    attempts: record.attempts,
    updatedAt: record.updatedAt,
  };
}

/** One line of the timeline without personal data: ids, accounts, divisions, counts. */
export function summarize(detailType: string, detail: Record<string, unknown>): string {
  const payload = (detail.payload ?? {}) as Record<string, unknown>;
  const ref = (value: unknown) => {
    const account = value as { system?: string; customerNumber?: string } | undefined;
    return account?.system && account.customerNumber
      ? `${account.system}:${account.customerNumber}`
      : undefined;
  };
  const counts = payload.counts as Record<string, number> | undefined;
  const contract = payload.contract as { division?: string } | undefined;
  const parts = [
    ref(payload.account),
    ref(payload.candidate) && `→ ${ref(payload.candidate)}`,
    ref(payload.linked) && `+ ${ref(payload.linked)}`,
    typeof payload.system === "string" ? payload.system : undefined,
    typeof payload.mode === "string" ? payload.mode : undefined,
    typeof payload.code === "string" ? payload.code : undefined,
    typeof payload.division === "string" ? payload.division : contract?.division,
    typeof payload.origin === "string" ? payload.origin : undefined,
    counts ? `${counts.migrated ?? 0} migrated, ${counts.failed ?? 0} failed` : undefined,
    Array.isArray(payload.accounts) ? `${payload.accounts.length} accounts removed` : undefined,
  ].filter(Boolean);
  return parts.join(" ") || detailType;
}

/** Migration cockpit (journey J8): progress, clarification cases, DLQ with redrive, timeline. */
export class Cockpit {
  constructor(private readonly ctx: MigrationContext) {}

  async status(caller: Caller): Promise<MigrationStatus> {
    const { repository } = this.ctx;
    const legacy = await this.ctx.legacy();
    const [records, runs, timeline, utilityTotal, telcoTotal] = await Promise.all([
      repository.listRecords(caller.tenantId),
      repository.listRuns(caller.tenantId),
      repository.listTimeline(caller.tenantId),
      legacyTotal(legacy, caller.tenantId, "utility"),
      legacyTotal(legacy, caller.tenantId, "telco"),
    ]);
    const now = this.ctx.now();
    const systems = (["utility", "telco"] as const).map((system) => {
      const counts = Object.fromEntries(RecordStatus.options.map((s) => [s, 0])) as Record<
        RecordStatus,
        number
      >;
      for (const record of records) {
        if (record.account.system === system) counts[record.status]++;
      }
      const total = system === "utility" ? utilityTotal : telcoTotal;
      return {
        system,
        ...(total === undefined ? {} : { total }),
        counts,
        migratedToday: migratedToday(records, system, now),
      };
    });
    const byUpdate = (a: RecordView, b: RecordView) => b.updatedAt.localeCompare(a.updatedAt);
    return {
      systems,
      clarifications: records
        .filter((r) => r.status === "clarification")
        .map(view)
        .sort(byUpdate),
      deadLetters: records
        .filter((r) => r.status === "failed")
        .map(view)
        .sort(byUpdate),
      runs,
      timeline,
      trends: migrationTrends(records, now),
    };
  }

  /**
   * `GET /migration/search?q=`: accounts and timeline events of the caller's tenant that
   * contain the query (any case), at most ten each, newest first. Reads what the status
   * reads — one query of the records, the timeline with a larger page — no index, no scan.
   */
  async search(caller: Caller, q: string | undefined): Promise<MigrationSearchResult> {
    const query = searchQuery(q);
    const { repository } = this.ctx;
    const [records, timeline] = await Promise.all([
      repository.listRecords(caller.tenantId),
      repository.listTimeline(caller.tenantId, SEARCH_TIMELINE_ENTRIES),
    ]);
    return {
      query,
      accounts: matchRecords(records, query).map(view),
      events: matchTimeline(timeline, query),
    };
  }

  /**
   * `POST /migration/dlq/{id}/redrive`: takes the failed task out of the DLQ and hands it
   * to the processor again, optionally with corrections the operator entered (e.g. the
   * missing postal code; the legacy system itself stays untouched).
   */
  async redrive(caller: Caller, id: string, body: unknown, correlationId: string) {
    const account = accountFromRecordId(id);
    if (!account) throw notFound("Unknown record");
    const corrections = Corrections.safeParse((body as { corrections?: unknown })?.corrections);
    if (!corrections.success) throw new HttpError(400, "Bad Request", corrections.error.message);
    const { repository, deadLetters, dispatcher } = this.ctx;
    const record = await repository.getRecord(caller.tenantId, account);
    if (!record) throw notFound("Unknown record");
    if (record.status !== "failed") {
      throw new HttpError(409, "Conflict", `The record is ${record.status}, not failed`);
    }
    const removed = await deadLetters.remove(caller.tenantId, account);
    if (!removed) log("warn", "Failed task not found in the DLQ; redriving anyway", { id });
    const merged = { ...record.corrections, ...corrections.data };
    const now = this.ctx.now().toISOString();
    await repository.putRecord(caller.tenantId, {
      ...record,
      status: "queued",
      corrections: merged,
      updatedAt: now,
      // The dead letter trend needs both ends of its stay in the queue; a record that
      // failed before `failedAt` existed failed at its last update.
      failedAt: record.failedAt ?? record.updatedAt,
      redrivenAt: now,
    });
    await dispatcher.dispatch({
      tenantId: caller.tenantId,
      account,
      corrections: merged,
      correlationId,
    });
    log("info", "Record redriven", { tenantId: caller.tenantId, account: refString(account) });
    return view({ ...record, status: "queued" });
  }

  /**
   * `POST /migration/reset` (demo reset): removes the portal accounts the migration
   * created (lazy and bulk) and announces them in `MigratedAccountsRemoved`, so every
   * domain deletes its data of these customers (profile, contracts, readings, documents,
   * mailbox). Then it deletes its own items — link offers, the identity marker, records,
   * runs and the timeline — and, for the owner only, empties the shared DLQ, so the
   * journeys can be shown again. The legacy systems keep their data.
   *
   * The records go last: if publishing fails, a second reset still finds the identities.
   */
  async reset(
    caller: Caller,
    correlationId = "demo-reset",
  ): Promise<{ accountsRemoved: number; recordsRemoved: number }> {
    const { repository, accounts, deadLetters, events } = this.ctx;
    const { tenantId } = caller;
    const records = await repository.listRecords(tenantId);
    const removed = new Map<string, string>();
    for (const record of records) {
      // Never the caller's own account, even if it came from a legacy system.
      if (!record.subject || record.subject === caller.subject) continue;
      removed.set(record.subject, record.customerId ?? customerIdFor(tenantId, record.subject));
    }
    let accountsRemoved = 0;
    for (const subject of removed.keys()) {
      if (await accounts.remove(subject)) accountsRemoved++;
    }
    // Also identities whose Cognito user was already gone: their data may still be there.
    const removedAccounts = [...removed].map(([subject, customerId]) => ({ subject, customerId }));
    // Before publishing, so the timeline starts again with the reset's own events.
    const occurredAt = this.ctx.now().toISOString();
    await repository.clearTimeline(tenantId, occurredAt);
    for (let i = 0; i < removedAccounts.length; i += MAX_REMOVED_ACCOUNTS_PER_EVENT) {
      await events.publish(MigratedAccountsRemoved, {
        eventId: this.ctx.newId(),
        tenantId,
        occurredAt,
        correlationId,
        payload: {
          reason: "demo-reset",
          accounts: removedAccounts.slice(i, i + MAX_REMOVED_ACCOUNTS_PER_EVENT),
        },
      });
    }
    for (const subject of removed.keys()) await repository.clearSubject(tenantId, subject);
    const recordsRemoved = await repository.clearTenant(tenantId);
    // The DLQ is shared by all tenants: only the owner may empty it. A pass's leftover
    // tasks are dropped by the processor once the pass is gone, or redriven by record.
    if (tenantId === OWNER_TENANT) await deadLetters.purge();
    log("info", "Demo reset", { tenantId, accountsRemoved, recordsRemoved });
    return { accountsRemoved, recordsRemoved };
  }

  /** Every domain event of the bus becomes a timeline entry of its tenant. */
  async record(input: EventBridgeEnvelope): Promise<void> {
    const detail = input.detail as Record<string, unknown> | undefined;
    const tenantId = typeof detail?.tenantId === "string" ? detail.tenantId : undefined;
    const eventId = typeof detail?.eventId === "string" ? detail.eventId : undefined;
    const occurredAt = typeof detail?.occurredAt === "string" ? detail.occurredAt : undefined;
    if (!tenantId || !eventId || !occurredAt || !detail) return;
    // A pass tenant's table exists only while it is set up (e.g. not yet for
    // `DemoPassIssued`, no longer for `TenantDeleted`).
    const status = await this.ctx.tenants.status(tenantId);
    if (status !== "active" && status !== "quota-exceeded") return;
    await this.ctx.repository.addTimeline(tenantId, {
      eventId,
      source: input.source,
      detailType: input["detail-type"],
      occurredAt,
      summary: summarize(input["detail-type"], detail),
    });
  }
}
