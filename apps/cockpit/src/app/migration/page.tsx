import {
  ButtonLink,
  CockpitGrid,
  Icon,
  LiveIndicator,
  Notice,
  Page,
  SearchField,
  Stack,
} from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { tenantOf } from "@kundenportal/web-auth";
import { requireSession } from "@kundenportal/web-auth/pages";
import { AutoRefresh } from "@/components/auto-refresh";
import {
  ClarificationsCard,
  CockpitKpis,
  DeadLettersCard,
  ResetCard,
  RunsCard,
  TimelineCard,
} from "@/components/overview";
import { dictionary } from "@/i18n";
import { loadStatus } from "@/lib/status";
import { accessOf } from "@/lib/tenancy";
import { clockTime } from "@/lib/time";
import { MIGRATION_PATH, SEARCH_PATH } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Migration cockpit (mockup screen "cockpit"), for the owner and pass holders: the phase 6
 * overview, now the operator cockpit's area "Migration" at /cockpit/migration.
 */
export default async function MigrationPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession(MIGRATION_PATH);
  const [{ locale, t }, params] = await Promise.all([dictionary(), searchParams]);
  const all = params.klaerfaelle === "alle";
  // Owner: the owner tenant and the pass administration. Pass holders: the cockpit of their
  // own tenant, which the API scopes by the token. The API checks the groups itself.
  const access = accessOf(session);
  const result = access === "none" ? undefined : await loadStatus(session);

  if (access === "none" || result?.code === 403) {
    return (
      <Page eyebrow={t.eyebrow} title={t.title}>
        <Notice tone="warning" data-testid="cockpit-forbidden">
          {t.forbidden}
        </Notice>
      </Page>
    );
  }

  const now = new Date();
  const refresh = (
    <ButtonLink
      href={all ? `${MIGRATION_PATH}?klaerfaelle=alle` : MIGRATION_PATH}
      variant="secondary"
      className="cockpit-button-small"
      linkComponent={ZoneLink}
    >
      <Icon name="refresh" />
      {t.refresh}
    </ButtonLink>
  );
  const status = result?.status;
  if (!status) {
    return (
      <Page eyebrow={t.eyebrow} title={t.title} aside={refresh} lead={t.lead}>
        <Notice tone="error">{t.error}</Notice>
      </Page>
    );
  }

  const tenant = tenantOf(session.accessToken);
  return (
    <Page
      eyebrow={t.eyebrow}
      title={t.title}
      aside={
        <>
          <LiveIndicator>{fill(t.live, { time: clockTime(now) })}</LiveIndicator>
          {refresh}
        </>
      }
      lead={t.lead}
    >
      <AutoRefresh seconds={10} />
      <Stack>
        {/* Phones have no search in the top bar; it sits on the page instead. */}
        <div className="cockpit-phone-search">
          <SearchField
            action={SEARCH_PATH}
            label={t.frame.search}
            placeholder={t.frame.searchPlaceholder}
            kbd={false}
          />
        </div>
        {access === "pass" && (
          <Notice tone="info" data-testid="cockpit-tenant" data-tenant={tenant}>
            {fill(t.access.ownInstance, { tenant: tenant ?? "" })}
          </Notice>
        )}
        <CockpitKpis status={status} t={t} locale={locale} />
        <CockpitGrid>
          <Stack>
            <RunsCard status={status} t={t} locale={locale} />
            <ClarificationsCard status={status} t={t} locale={locale} all={all} now={now} />
            <DeadLettersCard status={status} t={t} locale={locale} />
          </Stack>
          <Stack>
            <TimelineCard status={status} t={t} locale={locale} now={now} />
            <ResetCard t={t} />
          </Stack>
        </CockpitGrid>
      </Stack>
    </Page>
  );
}
