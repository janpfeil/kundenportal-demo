import { EventBridgeEnvelope, type LegacySystem } from "@kundenportal/events";
import { type Caller, HttpError, log, notFound } from "@kundenportal/service-kit";
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

/** Cockpit view of one record (clarification case or dead letter). */
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
  }[];
  clarifications: RecordView[];
  deadLetters: RecordView[];
  runs: MigrationRun[];
  timeline: TimelineEntry[];
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
    const systems = (["utility", "telco"] as const).map((system) => {
      const counts = Object.fromEntries(RecordStatus.options.map((s) => [s, 0])) as Record<
        RecordStatus,
        number
      >;
      for (const record of records) {
        if (record.account.system === system) counts[record.status]++;
      }
      const total = system === "utility" ? utilityTotal : telcoTotal;
      return { system, ...(total === undefined ? {} : { total }), counts };
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
    await repository.putRecord(caller.tenantId, {
      ...record,
      status: "queued",
      corrections: merged,
      updatedAt: this.ctx.now().toISOString(),
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
   * created (lazy and bulk), the tenant's migration records and runs, and empties the
   * DLQ, so the journeys can be shown again. The legacy systems keep their data; their
   * customers' portal profiles stay behind unreachable (a demo pass gets its own table
   * in phase 4 and drops everything at once).
   */
  async reset(caller: Caller): Promise<{ accountsRemoved: number; recordsRemoved: number }> {
    const { repository, accounts, deadLetters } = this.ctx;
    const records = await repository.listRecords(caller.tenantId);
    const subjects = [...new Set(records.map((r) => r.subject).filter((s): s is string => !!s))];
    let accountsRemoved = 0;
    for (const subject of subjects) {
      // Never the caller's own account, even if it came from a legacy system.
      if (subject === caller.subject) continue;
      if (await accounts.remove(subject)) accountsRemoved++;
    }
    const recordsRemoved = await repository.clearTenant(caller.tenantId);
    await deadLetters.purge();
    log("info", "Demo reset", { tenantId: caller.tenantId, accountsRemoved, recordsRemoved });
    return { accountsRemoved, recordsRemoved };
  }

  /** Every domain event of the bus becomes a timeline entry of its tenant. */
  async record(input: EventBridgeEnvelope): Promise<void> {
    const detail = input.detail as Record<string, unknown> | undefined;
    const tenantId = typeof detail?.tenantId === "string" ? detail.tenantId : undefined;
    const eventId = typeof detail?.eventId === "string" ? detail.eventId : undefined;
    const occurredAt = typeof detail?.occurredAt === "string" ? detail.occurredAt : undefined;
    if (!tenantId || !eventId || !occurredAt || !detail) return;
    await this.ctx.repository.addTimeline(tenantId, {
      eventId,
      source: input.source,
      detailType: input["detail-type"],
      occurredAt,
      summary: summarize(input["detail-type"], detail),
    });
  }
}
