import {
  Card,
  CockpitGrid,
  type Column,
  DataTable,
  Notice,
  Page,
  SearchField,
  Stack,
  StatusBadge,
  Timeline,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import { apiFor } from "@kundenportal/web-auth";
import { requireSession } from "@kundenportal/web-auth/pages";
import type { ReactNode } from "react";
import { timelineItems } from "@/components/overview";
import { type Dictionary, dictionary } from "@/i18n";
import { RECORD_TONES, type RecordView, recordAnchor } from "@/lib/cockpit";
import { PASS_TONES } from "@/lib/passes";
import { type SearchResult, groupResults, readQuery } from "@/lib/search";
import { type PassSummary, accessOf, listPasses } from "@/lib/tenancy";
import { shortStamp } from "@/lib/time";
import { SEARCH_PATH, zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const counted = (title: string, count: number): ReactNode => (
  <>
    {title} <span className="cockpit-tag">{count}</span>
  </>
);

function accountColumns(t: Dictionary, locale: Locale, now: Date): Column<RecordView>[] {
  return [
    {
      key: "account",
      header: t.columns.account,
      render: (row) => {
        const anchor = recordAnchor(row.status);
        const number = <span className="kp-mono cockpit-nowrap">{row.customerNumber}</span>;
        return anchor ? (
          <ZoneLink href={zonePath(anchor)} title={t.search.open}>
            {number}
          </ZoneLink>
        ) : (
          number
        );
      },
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
      key: "status",
      header: t.passes.list.status,
      render: (row) => (
        <StatusBadge tone={RECORD_TONES[row.status] ?? "neutral"}>
          {t.statuses[row.status] ?? row.status}
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
}

function tenantColumns(t: Dictionary): Column<PassSummary>[] {
  const list = t.passes.list;
  return [
    {
      key: "email",
      header: list.email,
      render: (pass) => (
        <ZoneLink href={zonePath("/paesse")} className="cockpit-break">
          {pass.email}
        </ZoneLink>
      ),
    },
    {
      key: "tenant",
      header: list.tenant,
      render: (pass) => <span className="kp-mono">{pass.tenantId}</span>,
    },
    {
      key: "status",
      header: list.status,
      render: (pass) => (
        <StatusBadge tone={PASS_TONES[pass.status] ?? "neutral"}>
          {t.passes.statuses[pass.status] ?? pass.status}
        </StatusBadge>
      ),
    },
  ];
}

/** Results of the top bar's search: accounts, tenants (owner) and events, grouped. */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession(zonePath("/suche"));
  const [{ locale, t }, params] = await Promise.all([dictionary(), searchParams]);
  const query = readQuery(params.q);
  const access = accessOf(session);
  const texts = t.search;
  const head = { eyebrow: t.eyebrow, title: texts.title };
  if (access === "none") {
    return (
      <Page {...head}>
        <Notice tone="warning" data-testid="cockpit-forbidden">
          {t.forbidden}
        </Notice>
      </Page>
    );
  }

  const owner = access === "owner";
  let result: SearchResult | undefined;
  let passes: PassSummary[] | undefined;
  let searchFailed = false;
  if (query.kind === "ok") {
    const [answer, passList] = await Promise.all([
      apiFor(session)
        .GET("/migration/search", { params: { query: { q: query.query } } })
        .catch(() => undefined),
      owner ? listPasses(session) : Promise.resolve(undefined),
    ]);
    if (answer?.response.status === 403) {
      return (
        <Page {...head}>
          <Notice tone="warning" data-testid="cockpit-forbidden">
            {t.forbidden}
          </Notice>
        </Page>
      );
    }
    result = answer?.data;
    searchFailed = result === undefined;
    passes = passList;
  }

  const now = new Date();
  const groups = query.kind === "ok" ? groupResults(result, passes, query.query, owner) : undefined;
  const lead =
    query.kind === "ok"
      ? fill(owner ? texts.lead : texts.leadPass, { query: query.query })
      : texts.empty;

  return (
    <Page {...head} lead={lead}>
      <Stack data-testid="search-results" data-query={query.kind === "empty" ? "" : query.query}>
        <div className="cockpit-phone-search">
          <SearchField
            action={SEARCH_PATH}
            label={t.frame.search}
            placeholder={t.frame.searchPlaceholder}
            defaultValue={query.kind === "empty" ? "" : query.query}
            kbd={false}
          />
        </div>
        {query.kind === "short" && <Notice tone="info">{texts.short}</Notice>}
        {searchFailed && <Notice tone="error">{texts.failed}</Notice>}
        {owner && query.kind === "ok" && passes === undefined && (
          <Notice tone="error">{texts.passesFailed}</Notice>
        )}
        {groups && groups.total === 0 && !searchFailed && (
          <p className="kp-muted" data-testid="search-none">
            {fill(texts.none, { query: query.kind === "ok" ? query.query : "" })}
          </p>
        )}
        {groups && groups.total > 0 && (
          <CockpitGrid>
            <Stack>
              <Card as="section" title={counted(texts.accounts, groups.accounts.length)}>
                <DataTable
                  data-testid="search-accounts"
                  className="cockpit-table"
                  caption={<span className="kp-sr-only">{texts.accountsCaption}</span>}
                  columns={accountColumns(t, locale, now)}
                  rows={groups.accounts}
                  rowKey={(row) => row.id}
                  empty={<p className="kp-muted cockpit-small">{texts.noHits}</p>}
                />
              </Card>
              {groups.tenants && (
                <Card
                  as="section"
                  title={counted(texts.tenants, groups.tenants.length)}
                  actions={
                    <ZoneLink className="cockpit-small" href={zonePath("/paesse")}>
                      {texts.openPasses}
                    </ZoneLink>
                  }
                >
                  <DataTable
                    data-testid="search-tenants"
                    className="cockpit-table"
                    caption={<span className="kp-sr-only">{texts.tenantsCaption}</span>}
                    columns={tenantColumns(t)}
                    rows={groups.tenants}
                    rowKey={(pass) => pass.passId}
                    empty={<p className="kp-muted cockpit-small">{texts.noHits}</p>}
                  />
                </Card>
              )}
            </Stack>
            <Card as="section" title={counted(texts.events, groups.events.length)}>
              {groups.events.length === 0 ? (
                <p className="kp-muted cockpit-small">{texts.noHits}</p>
              ) : (
                <Timeline
                  data-testid="search-events"
                  aria-label={texts.events}
                  items={timelineItems(groups.events, t, locale, now)}
                />
              )}
            </Card>
          </CockpitGrid>
        )}
      </Stack>
    </Page>
  );
}
