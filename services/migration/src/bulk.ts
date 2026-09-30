import {
  BulkMigrationCompleted,
  type BulkMigrationCounts,
  BulkMigrationStarted,
  type BulkMigrationStartedDetail,
  customerIdFor,
  deterministicUuid,
  LegacyAccountMigrated,
  type LegacySystem,
  type MigrationFailureCode,
  MigrationRecordFailed,
  PasswordResetRequired,
} from "@kundenportal/events";
import { type Caller, HttpError, log } from "@kundenportal/service-kit";
import { type MigrationContext, readExport, readRecord } from "./context.js";
import {
  INACTIVE_MONTHS,
  type MigrationRecord,
  type MigrationRun,
  type RecordTask,
  refString,
} from "./model.js";

/** A record failed for good; the processor throws it so Lambda hands the task to the DLQ. */
export class RecordFailedError extends Error {
  override readonly name = "RecordFailedError";
}

const ZERO: BulkMigrationCounts = {
  read: 0,
  migrated: 0,
  skippedActive: 0,
  alreadyMigrated: 0,
  clarification: 0,
  failed: 0,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bulk import of inactive legacy accounts (journey J7): the owner starts a run, the
 * worker reads the export and hands every inactive record to the processor, which
 * creates the portal account or records why it cannot.
 */
export class BulkImport {
  constructor(private readonly ctx: MigrationContext) {}

  /** `POST /migration/bulk`: starts a run for one legacy system. */
  async start(caller: Caller, system: LegacySystem, correlationId: string): Promise<MigrationRun> {
    const { repository, events } = this.ctx;
    const now = this.ctx.now();
    const running = (await repository.listRuns(caller.tenantId)).find(
      (run) =>
        run.system === system &&
        run.status === "running" &&
        now.getTime() - Date.parse(run.startedAt) < 15 * 60 * 1000,
    );
    if (running) {
      throw new HttpError(409, "Conflict", `A ${system} import is already running`);
    }
    const run: MigrationRun = {
      runId: `${now.toISOString().replace(/[-:.]/g, "")}-${this.ctx.newId().slice(0, 8)}`,
      system,
      status: "running",
      startedAt: now.toISOString(),
      startedBy: caller.subject,
      processed: 0,
      counts: ZERO,
    };
    await repository.createRun(caller.tenantId, run);
    await events.publish(BulkMigrationStarted, {
      eventId: deterministicUuid(caller.tenantId, "BulkMigrationStarted", run.runId),
      tenantId: caller.tenantId,
      occurredAt: run.startedAt,
      correlationId,
      payload: {
        runId: run.runId,
        system,
        inactiveMonths: INACTIVE_MONTHS,
        startedBy: caller.subject,
      },
    });
    log("info", "Bulk migration started", { tenantId: caller.tenantId, runId: run.runId, system });
    return run;
  }

  /** `BulkMigrationStarted`: reads the export, classifies and dispatches (once per run). */
  async onStarted(event: BulkMigrationStartedDetail): Promise<void> {
    const { repository, dispatcher } = this.ctx;
    const { tenantId, correlationId, payload } = event;
    const run = await repository.getRun(tenantId, payload.runId);
    if (!run || run.dispatched !== undefined) return;

    const records = await readExport(await this.ctx.legacy(), tenantId, payload.system);
    const inactiveBefore = this.ctx.now().getTime() - payload.inactiveMonths * 30 * DAY_MS;
    const counts = { ...ZERO, read: records.length };
    const tasks: RecordTask[] = [];
    for (const record of records) {
      const existing = await repository.getRecord(tenantId, record.account);
      if (existing?.status === "migrated" || existing?.status === "linked") {
        counts.alreadyMigrated++;
        continue;
      }
      const inactive = Date.parse(record.lastSignInAt) < inactiveBefore;
      const tracked: MigrationRecord = {
        account: record.account,
        displayName: record.displayName,
        status: inactive ? "queued" : "pending-lazy",
        lastSignInAt: record.lastSignInAt,
        runId: payload.runId,
        attempts: existing?.attempts ?? 0,
        updatedAt: this.ctx.now().toISOString(),
      };
      await repository.putRecord(tenantId, tracked);
      if (!inactive) {
        counts.skippedActive++;
        continue;
      }
      tasks.push({ tenantId, account: record.account, runId: payload.runId, correlationId });
    }

    await repository.countRun(tenantId, payload.runId, counts, { dispatched: tasks.length });
    for (const task of tasks) await dispatcher.dispatch(task);
    log("info", "Bulk migration dispatched", {
      tenantId,
      runId: payload.runId,
      ...counts,
      dispatched: tasks.length,
    });
    if (tasks.length === 0) await this.finish(tenantId, payload.runId, correlationId);
  }

  /**
   * Processor: migrates one inactive record. Clarification cases are recorded and done;
   * failures are recorded, announced (`MigrationRecordFailed`) and thrown, so Lambda
   * puts the task into the migration DLQ, from where the cockpit can redrive it. An
   * unexpected error (legacy system down, throttling) is treated the same way, so every
   * dispatched record ends up counted and visible in the cockpit.
   */
  async process(task: RecordTask): Promise<void> {
    const existing = await this.ctx.repository.getRecord(task.tenantId, task.account);
    if (existing?.status === "migrated" || existing?.status === "linked") {
      return this.count(task, { alreadyMigrated: 1 });
    }
    const attempts = (existing?.attempts ?? 0) + 1;
    const base: MigrationRecord = {
      account: task.account,
      displayName: existing?.displayName ?? refString(task.account),
      status: "queued",
      attempts,
      updatedAt: this.ctx.now().toISOString(),
      ...(task.runId ? { runId: task.runId } : existing?.runId ? { runId: existing.runId } : {}),
      ...(existing?.lastSignInAt ? { lastSignInAt: existing.lastSignInAt } : {}),
      ...(task.corrections && Object.keys(task.corrections).length
        ? { corrections: task.corrections }
        : {}),
    };
    try {
      await this.migrate(task, base);
    } catch (error) {
      if (error instanceof RecordFailedError) throw error;
      await this.fail(task, base, {
        code: "unexpected",
        message: error instanceof Error ? error.message : String(error),
        fields: [],
      });
    }
  }

  private async migrate(task: RecordTask, base: MigrationRecord): Promise<void> {
    const { repository, events } = this.ctx;
    const { tenantId, account, correlationId } = task;
    const mapped = await readRecord(await this.ctx.legacy(), tenantId, account, task.corrections);
    if (!mapped) {
      return this.fail(task, base, {
        code: "unexpected",
        message: "Record no longer exists in the legacy system",
        fields: [],
      });
    }
    const named = { ...base, displayName: mapped.displayName, lastSignInAt: mapped.lastSignInAt };
    const problem = !mapped.ok
      ? { code: mapped.code, message: mapped.message, fields: mapped.fields }
      : undefined;
    if (!mapped.ok && mapped.kind === "clarification") {
      await repository.putRecord(tenantId, { ...named, status: "clarification", problem });
      return this.count(task, { clarification: 1 });
    }
    if (!mapped.ok)
      return this.fail(task, named, problem ?? { code: "unexpected", message: "", fields: [] });

    const provisioned = await this.ctx.accounts.provision(
      account,
      mapped.email,
      mapped.displayName,
    );
    if (!provisioned.ok) {
      return this.fail(task, named, {
        code: "identity-conflict",
        message: provisioned.reason,
        fields: ["email"],
      });
    }

    const { subject } = provisioned;
    const customerId = customerIdFor(tenantId, subject);
    const ref = refString(account);
    const now = this.ctx.now().toISOString();
    await events.publish(LegacyAccountMigrated, {
      eventId: deterministicUuid(tenantId, "LegacyAccountMigrated", ref),
      tenantId,
      occurredAt: now,
      correlationId,
      payload: {
        customerId,
        subject,
        email: mapped.email,
        displayName: mapped.displayName,
        locale: "de",
        account,
        mode: "bulk",
        passwordMigrated: false,
        profile: mapped.profile,
        contracts: mapped.contracts,
      },
    });
    await events.publish(PasswordResetRequired, {
      eventId: deterministicUuid(tenantId, "PasswordResetRequired", ref),
      tenantId,
      occurredAt: now,
      correlationId,
      payload: {
        customerId,
        subject,
        email: mapped.email,
        account,
        // Telco: own scheme with a secret pepper. Utility: bcrypt would be importable, but
        // only by a CSV import job (see architektur.md); the demo resets instead.
        reason: account.system === "telco" ? "hash-not-transferable" : "hash-import-unavailable",
      },
    });
    const { problem: _problem, ...clean } = named;
    await repository.putRecord(
      tenantId,
      { ...clean, status: "migrated", mode: "bulk", customerId, subject },
      true,
    );
    log("info", "Record migrated", { tenantId, account: ref, created: provisioned.created });
    await this.count(task, { migrated: 1 });
  }

  private async fail(
    task: RecordTask,
    record: MigrationRecord,
    problem: { code: MigrationFailureCode; message: string; fields: string[] },
  ): Promise<never> {
    const { tenantId, account, correlationId } = task;
    await this.ctx.repository.putRecord(tenantId, { ...record, status: "failed", problem });
    await this.ctx.events.publish(MigrationRecordFailed, {
      eventId: deterministicUuid(
        tenantId,
        "MigrationRecordFailed",
        refString(account),
        String(record.attempts),
      ),
      tenantId,
      occurredAt: this.ctx.now().toISOString(),
      correlationId,
      payload: {
        account,
        ...(record.runId ? { runId: record.runId } : {}),
        ...problem,
        attempts: Math.max(1, record.attempts),
      },
    });
    await this.count(task, { failed: 1 });
    throw new RecordFailedError(`${refString(account)}: ${problem.message}`);
  }

  /** Counts a processed record of a run; the last one completes the run. */
  private async count(task: RecordTask, counts: Partial<BulkMigrationCounts>): Promise<void> {
    if (!task.runId) return;
    const run = await this.ctx.repository.countRun(task.tenantId, task.runId, counts, {
      processed: 1,
    });
    if (run.dispatched !== undefined && run.processed >= run.dispatched) {
      await this.finish(task.tenantId, task.runId, task.correlationId);
    }
  }

  private async finish(tenantId: string, runId: string, correlationId: string): Promise<void> {
    const { repository, events } = this.ctx;
    const now = this.ctx.now().toISOString();
    if (!(await repository.completeRun(tenantId, runId, now))) return;
    const run = await repository.getRun(tenantId, runId);
    if (!run) return;
    await events.publish(BulkMigrationCompleted, {
      eventId: deterministicUuid(tenantId, "BulkMigrationCompleted", runId),
      tenantId,
      occurredAt: now,
      correlationId,
      payload: { runId, system: run.system, counts: run.counts },
    });
    log("info", "Bulk migration completed", { tenantId, runId, ...run.counts });
  }
}
