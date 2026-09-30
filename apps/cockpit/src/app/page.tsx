import type { MigrationStatus } from "@kundenportal/api-contract";
import {
  Badge,
  ButtonLink,
  Card,
  type Column,
  DataTable,
  EmptyState,
  Notice,
  Page,
  formatDateTime,
  percent,
} from "@kundenportal/ui";
import { apiFor, tenantOf } from "@kundenportal/web-auth";
import { requireSession } from "@kundenportal/web-auth/pages";
import { AutoRefresh } from "@/components/auto-refresh";
import { BulkStart } from "@/components/bulk-start";
import { DemoReset } from "@/components/demo-reset";
import { RedriveForm } from "@/components/redrive-form";
import { dictionary } from "@/i18n";
import { accessOf } from "@/lib/tenancy";
import { fill } from "@kundenportal/ui/i18n";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

type RecordView = MigrationStatus["deadLetters"][number];
type Run = MigrationStatus["runs"][number];
type Entry = MigrationStatus["timeline"][number];

export default async function CockpitPage() {
  const session = await requireSession(zonePath());
  const { locale, t } = await dictionary();
  // Owner: the owner tenant and the pass administration. Pass holders: the cockpit of their
  // own tenant, which the API scopes by the token. The API checks the groups itself.
  const access = accessOf(session);
  const result =
    access === "none"
      ? undefined
      : await apiFor(session)
          .GET("/migration/status")
          .catch(() => undefined);

  const actions = (
    <>
      <ButtonLink href={zonePath()} variant="secondary" linkComponent={ZoneLink}>
        {t.refresh}
      </ButtonLink>
      {access === "owner" && (
        <ButtonLink
          href={zonePath("/paesse")}
          variant="secondary"
          linkComponent={ZoneLink}
          data-testid="to-passes"
        >
          {t.access.toPasses}
        </ButtonLink>
      )}
    </>
  );
  if (access === "none" || result?.response.status === 403) {
    return (
      <Page title={t.title}>
        <Notice tone="warning" data-testid="cockpit-forbidden">
          {t.forbidden}
        </Notice>
      </Page>
    );
  }
  const status: MigrationStatus | undefined = result?.data;
  if (!status) {
    return (
      <Page title={t.title} actions={actions}>
        <Notice tone="error">{t.error}</Notice>
      </Page>
    );
  }

  const account = (row: RecordView) => (
    <span className="zone-break">
      {t.systems[row.system]} {row.customerNumber}
    </span>
  );
  const recordColumns: Column<RecordView>[] = [
    { key: "account", header: t.columns.account, render: account },
    { key: "name", header: t.columns.name, render: (row) => row.displayName },
    {
      key: "problem",
      header: t.columns.problem,
      render: (row) => <span className="zone-break">{row.message ?? row.code ?? ""}</span>,
    },
    {
      key: "updatedAt",
      header: t.columns.updatedAt,
      render: (row) => formatDateTime(row.updatedAt, locale, "medium"),
    },
  ];
  const deadLetterColumns: Column<RecordView>[] = [
    ...recordColumns,
    {
      key: "attempts",
      header: t.deadLetters.attempts,
      align: "end",
      render: (row) => row.attempts,
    },
    {
      key: "redrive",
      header: t.deadLetters.redrive,
      render: (row) => (
        <RedriveForm recordId={row.id} fields={row.fields ?? []} texts={t.deadLetters} />
      ),
    },
  ];
  const runColumns: Column<Run>[] = [
    { key: "system", header: t.progress.system, render: (run) => t.systems[run.system] },
    {
      key: "startedAt",
      header: t.bulk.startedAt,
      render: (run) => formatDateTime(run.startedAt, locale, "medium"),
    },
    {
      key: "status",
      header: t.bulk.status,
      render: (run) => (
        <Badge tone={run.status === "completed" ? "success" : "accent"}>
          {t.bulk.runStatus[run.status]}
        </Badge>
      ),
    },
    { key: "counts", header: t.bulk.counts, render: (run) => fill(t.bulk.countsText, run.counts) },
  ];

  return (
    <Page title={t.title} lead={t.lead} actions={actions}>
      <AutoRefresh seconds={10} />
      {access === "pass" && (
        <Notice
          tone="info"
          data-testid="cockpit-tenant"
          data-tenant={tenantOf(session.accessToken)}
        >
          {fill(t.access.ownInstance, { tenant: tenantOf(session.accessToken) ?? "" })}
        </Notice>
      )}
      <p className="kp-muted">{t.live}</p>

      <Card title={t.progress.title}>
        <ul className="cockpit-progress" data-testid="progress">
          {status.systems.map((system) => {
            const done = (system.counts.migrated ?? 0) + (system.counts.linked ?? 0);
            const share = percent(done, system.total);
            return (
              <li
                key={system.system}
                data-system={system.system}
                data-done={done}
                data-total={system.total ?? ""}
              >
                <strong>{t.systems[system.system]}</strong>{" "}
                {system.total === undefined ? (
                  <Badge tone="warning">{t.progress.unknown}</Badge>
                ) : (
                  fill(t.progress.of, { done, total: system.total, percent: share })
                )}
                <progress max={100} value={share} aria-label={t.systems[system.system]} />
                <span className="kp-muted cockpit-counts">
                  {Object.entries(system.counts)
                    .filter(([, count]) => count > 0)
                    .map(
                      ([name, count]) =>
                        `${t.statuses[name as keyof typeof t.statuses] ?? name}: ${count}`,
                    )
                    .join(" · ")}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={t.bulk.title} className="zone-section">
        <p className="kp-muted">{t.bulk.intro}</p>
        <BulkStart texts={{ bulk: t.bulk, systems: t.systems }} />
        {status.runs.length > 0 && (
          <DataTable
            data-testid="runs"
            caption={t.bulk.runCaption}
            columns={runColumns}
            rows={status.runs}
            rowKey={(run) => run.runId}
          />
        )}
      </Card>

      <Card title={t.clarifications.title} className="zone-section">
        <p className="kp-muted">{t.clarifications.intro}</p>
        <DataTable
          data-testid="clarifications"
          caption={t.clarifications.caption}
          columns={recordColumns}
          rows={status.clarifications}
          rowKey={(row) => row.id}
          empty={
            <p className="kp-muted" data-testid="clarifications">
              {t.clarifications.empty}
            </p>
          }
        />
      </Card>

      <Card title={t.deadLetters.title} className="zone-section">
        <p className="kp-muted">{t.deadLetters.intro}</p>
        <DataTable
          data-testid="dead-letters"
          caption={t.deadLetters.caption}
          columns={deadLetterColumns}
          rows={status.deadLetters}
          rowKey={(row) => row.id}
          empty={
            <p className="kp-muted" data-testid="dead-letters">
              {t.deadLetters.empty}
            </p>
          }
        />
      </Card>

      <Card title={t.timeline.title} className="zone-section">
        <p className="kp-muted">{t.timeline.intro}</p>
        {status.timeline.length === 0 ? (
          <EmptyState title={t.timeline.empty} />
        ) : (
          <ol className="cockpit-timeline" data-testid="timeline">
            {status.timeline.map((entry: Entry) => (
              <li key={entry.eventId} data-type={entry.detailType}>
                <time dateTime={entry.occurredAt}>
                  {formatDateTime(entry.occurredAt, locale, "medium")}
                </time>{" "}
                <strong>{entry.detailType}</strong>{" "}
                <span className="kp-muted zone-break">{entry.summary}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title={t.reset.title} className="zone-section">
        <p className="kp-muted">{t.reset.intro}</p>
        <DemoReset texts={t.reset} />
      </Card>
    </Page>
  );
}
