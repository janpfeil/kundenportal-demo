/*
 * The sections of the cockpit overview (docs/design/mockups.html, screen "cockpit"): key
 * figures, bulk import, clarification cases, dead-letter queue, event timeline and the
 * danger card. Server components without data fetching; the page passes the status.
 */

import type { MigrationStatus } from "@kundenportal/api-contract";
import {
  Card,
  type Column,
  DataTable,
  Kpi,
  KpiGrid,
  ProgressRing,
  Sparkline,
  StatusBadge,
  Timeline,
  type TimelineItem,
  formatNumber,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n";
import {
  CLARIFICATIONS_SHOWN,
  type Entry,
  type RecordView,
  type Run,
  clarificationDelta,
  problemText,
  progressOf,
  redriveDelta,
} from "@/lib/cockpit";
import { eventLook, eventTitle } from "@/lib/events";
import { dayStamp, shortStamp } from "@/lib/time";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";
import { BulkStart } from "./bulk-start";
import { DeadLetterTable } from "./dead-letter-table";
import { DemoReset } from "./demo-reset";

interface SectionProps {
  t: Dictionary;
  locale: Locale;
}

/** A card heading with the number of entries as a small tag, e.g. "Klärfälle 14". */
function counted(title: string, count: number): ReactNode {
  return (
    <>
      {title} <span className="cockpit-tag">{count}</span>
    </>
  );
}

const trendLabel = (template: string, values: readonly number[]) =>
  fill(template, { values: values.join(", ") });

/** Progress rings per legacy system, open clarification cases and the dead-letter queue. */
export function CockpitKpis({ status, t, locale }: SectionProps & { status: MigrationStatus }) {
  const n = (value: number) => formatNumber(value, locale);
  const clarifications = clarificationDelta(status.trends, t.kpis.sinceYesterday);
  const redriven = redriveDelta(status.trends, t.kpis.redriven);
  return (
    <KpiGrid data-testid="progress">
      {status.systems.map((system) => {
        const progress = progressOf(system);
        const name = t.systems[progress.system];
        const known = progress.total !== undefined;
        return (
          <Kpi
            key={progress.system}
            aria-label={fill(t.kpis.progress, { system: name })}
            data-system={progress.system}
            data-done={progress.done}
            data-total={progress.total ?? ""}
            label={name}
            value={n(progress.done)}
            of={known ? `/ ${n(progress.total ?? 0)}` : undefined}
            delta={{
              text: fill(t.kpis.today, { count: n(progress.today) }),
              tone: progress.today > 0 ? "good" : "neutral",
            }}
            hint={known ? undefined : t.kpis.unknown}
            ring={
              <ProgressRing
                value={progress.done}
                max={progress.total ?? 0}
                label={fill(known ? t.kpis.ring : t.kpis.ringUnknown, {
                  system: name,
                  done: n(progress.done),
                  total: n(progress.total ?? 0),
                  percent: progress.percent,
                })}
                center={known ? `${progress.percent} %` : "–"}
              />
            }
          />
        );
      })}
      <Kpi
        aria-label={t.kpis.clarifications}
        label={t.kpis.clarifications}
        value={n(status.clarifications.length)}
        delta={clarifications}
        aside={
          <Sparkline
            values={status.trends.clarifications}
            label={trendLabel(t.kpis.trend, status.trends.clarifications)}
          />
        }
      />
      <Kpi
        aria-label={t.kpis.deadLetters}
        label={t.kpis.deadLetters}
        value={n(status.deadLetters.length)}
        delta={redriven}
        aside={
          <Sparkline
            values={status.trends.deadLetters}
            label={trendLabel(t.kpis.trend, status.trends.deadLetters)}
          />
        }
      />
    </KpiGrid>
  );
}

const BULK_HINT = "cockpit-bulk-hint";

/** A thin progress bar of a running import (processed of dispatched tasks). */
function RunProgress({ run, t }: { run: Run; t: Dictionary }) {
  if (run.status !== "running" || !run.dispatched) return null;
  const processed = Math.min(run.processed, run.dispatched);
  const share = Math.round((processed / run.dispatched) * 1000) / 10;
  return (
    <div
      className="cockpit-run-bar"
      role="progressbar"
      aria-label={t.bulk.progress}
      aria-valuemin={0}
      aria-valuemax={run.dispatched}
      aria-valuenow={processed}
      aria-valuetext={fill(t.bulk.progressText, {
        processed: run.processed,
        dispatched: run.dispatched,
      })}
    >
      <span style={{ width: `${share}%` }} />
    </div>
  );
}

/** Bulk import of the inactive accounts: start buttons per system and the runs. */
export function RunsCard({ status, t, locale }: SectionProps & { status: MigrationStatus }) {
  const runs = [...status.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const running = [
    ...new Set(runs.filter((run) => run.status === "running").map((run) => run.system)),
  ];
  const columns: Column<Run>[] = [
    {
      key: "startedAt",
      header: t.bulk.startedAt,
      render: (run) => (
        <time className="kp-mono cockpit-nowrap" dateTime={run.startedAt}>
          {dayStamp(run.startedAt, locale)}
        </time>
      ),
    },
    {
      key: "system",
      header: t.bulk.system,
      render: (run) => <span className="cockpit-nowrap">{t.systems[run.system]}</span>,
    },
    {
      key: "status",
      header: t.bulk.status,
      render: (run) => (
        <StatusBadge
          tone={run.status === "completed" ? "ok" : "info"}
          pulse={run.status === "running"}
        >
          {t.bulk.runStatus[run.status]}
        </StatusBadge>
      ),
    },
    {
      key: "counts",
      header: t.bulk.counts,
      render: (run) => (
        <div>
          <RunProgress run={run} t={t} />
          <span className={run.status === "running" ? "kp-muted cockpit-small" : "cockpit-small"}>
            {fill(t.bulk.countsText, {
              read: formatNumber(run.counts.read, locale),
              migrated: formatNumber(run.counts.migrated, locale),
              skippedActive: formatNumber(run.counts.skippedActive, locale),
              clarification: formatNumber(run.counts.clarification, locale),
              failed: formatNumber(run.counts.failed, locale),
            })}
          </span>
        </div>
      ),
    },
  ];
  return (
    <Card
      as="section"
      title={t.bulk.title}
      actions={
        <BulkStart
          texts={{ bulk: t.bulk, systems: t.systems }}
          running={running}
          hintId={BULK_HINT}
        />
      }
    >
      <p className="kp-muted cockpit-small" id={BULK_HINT}>
        {running.map((system) => fill(t.bulk.runningFor, { system: t.systems[system] })).join(" ")}
        {running.length > 0 ? " " : ""}
        {t.bulk.intro}
      </p>
      {runs.length === 0 ? (
        <p className="kp-muted cockpit-small">{t.bulk.empty}</p>
      ) : (
        <DataTable
          data-testid="runs"
          className="cockpit-table"
          caption={<span className="kp-sr-only">{t.bulk.runCaption}</span>}
          columns={columns}
          rows={runs}
          rowKey={(run) => run.runId}
        />
      )}
    </Card>
  );
}

/** Open clarification cases: the newest five, all with "?klaerfaelle=alle". */
export function ClarificationsCard({
  status,
  t,
  locale,
  all,
  now,
}: SectionProps & { status: MigrationStatus; all: boolean; now: Date }) {
  const rows = status.clarifications;
  const shown = all ? rows : rows.slice(0, CLARIFICATIONS_SHOWN);
  const more = rows.length > CLARIFICATIONS_SHOWN;
  const columns: Column<RecordView>[] = [
    {
      key: "account",
      header: t.columns.account,
      render: (row) => <span className="kp-mono cockpit-nowrap">{row.customerNumber}</span>,
    },
    {
      key: "name",
      header: t.columns.name,
      render: (row) => (
        <span>
          {row.displayName}
          <span className="cockpit-sub">{t.systems[row.system]}</span>
        </span>
      ),
    },
    {
      key: "problem",
      header: t.columns.problem,
      render: (row) => (
        <StatusBadge tone="warn" title={row.message || undefined}>
          {problemText(row, t.problems)}
        </StatusBadge>
      ),
    },
    {
      key: "updatedAt",
      header: t.columns.updatedAt,
      render: (row) => (
        <time className="kp-mono cockpit-small cockpit-nowrap" dateTime={row.updatedAt}>
          {shortStamp(row.updatedAt, now, locale)}
        </time>
      ),
    },
  ];
  return (
    <Card
      as="section"
      id="klaerfaelle"
      title={counted(t.clarifications.title, rows.length)}
      actions={
        more ? (
          <ZoneLink
            className="cockpit-small"
            href={zonePath(all ? "#klaerfaelle" : "?klaerfaelle=alle#klaerfaelle")}
          >
            {all ? t.clarifications.showFewer : t.clarifications.showAll}
          </ZoneLink>
        ) : undefined
      }
    >
      <DataTable
        data-testid="clarifications"
        className="cockpit-table"
        caption={<span className="kp-sr-only">{t.clarifications.caption}</span>}
        columns={columns}
        rows={shown}
        rowKey={(row) => row.id}
        empty={
          <p className="kp-muted cockpit-small" data-testid="clarifications">
            {t.clarifications.empty}
          </p>
        }
      />
    </Card>
  );
}

/** Failed records with the inline correction and redrive. */
export function DeadLettersCard({ status, t }: SectionProps & { status: MigrationStatus }) {
  const rows = status.deadLetters.map((row) => ({
    id: row.id,
    customerNumber: row.customerNumber,
    displayName: row.displayName,
    problem: problemText(row, t.problems),
    message: row.message,
    attempts: row.attempts,
    fields: row.fields ?? [],
  }));
  return (
    <Card as="section" id="dlq" title={counted(t.deadLetters.title, rows.length)}>
      <p className="kp-muted cockpit-small">{t.deadLetters.intro}</p>
      {rows.length === 0 ? (
        <p className="kp-muted cockpit-small" data-testid="dead-letters">
          {t.deadLetters.empty}
        </p>
      ) : (
        <DeadLetterTable rows={rows} texts={t.deadLetters} columns={t.columns} />
      )}
    </Card>
  );
}

/** Timeline entries in the mockup's form: icon, title in words, type, ids and time. */
export function timelineItems(
  entries: readonly Entry[],
  t: Dictionary,
  locale: Locale,
  now: Date,
): TimelineItem[] {
  return entries.map((entry) => {
    const look = eventLook(entry.detailType);
    return {
      id: entry.eventId,
      icon: look.icon,
      tone: look.tone,
      title: eventTitle(entry.detailType, entry.summary, t.events, t.systems),
      code: entry.detailType,
      meta: entry.summary && entry.summary !== entry.detailType ? [entry.summary] : [],
      time: <time dateTime={entry.occurredAt}>{shortStamp(entry.occurredAt, now, locale)}</time>,
    };
  });
}

/** The portal's events of the last seven days, newest first. */
export function TimelineCard({
  status,
  t,
  locale,
  now,
}: SectionProps & { status: MigrationStatus; now: Date }) {
  return (
    <Card
      as="section"
      id="ereignisse"
      title={t.timeline.title}
      actions={<span className="kp-muted cockpit-small">{t.timeline.period}</span>}
    >
      {status.timeline.length === 0 ? (
        <p className="kp-muted cockpit-small">{t.timeline.empty}</p>
      ) : (
        <Timeline
          data-testid="timeline"
          aria-label={t.timeline.caption}
          items={timelineItems(status.timeline, t, locale, now)}
        />
      )}
    </Card>
  );
}

/** "Demo zurücksetzen" as a separate danger card. */
export function ResetCard({ t }: { t: Dictionary }) {
  return (
    <Card as="section" tone="danger" title={t.reset.title}>
      <p className="kp-muted cockpit-small">{t.reset.intro}</p>
      <DemoReset texts={t.reset} />
    </Card>
  );
}
