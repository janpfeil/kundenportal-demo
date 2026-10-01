import { Card, CockpitGrid, Notice, Page, Stack } from "@kundenportal/ui";
import { requireSession } from "@kundenportal/web-auth/pages";
import { ContractTable } from "@/components/contract-table";
import {
  DivisionsCard,
  MigrationCard,
  OperatorKpis,
  QuickLinks,
} from "@/components/operator-overview";
import { OperatorForbidden, PhoneSearch, TenantNotice } from "@/components/operator-ui";
import { dictionary } from "@/i18n";
import { forbidden, loadContracts, loadCustomers, loadOverview, loadProducts } from "@/lib/admin";
import { catalogOf } from "@/lib/contracts";
import { loadStatus } from "@/lib/status";
import { accessOf } from "@/lib/tenancy";
import { addDays, dayKey } from "@/lib/time";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

/** Number of contracts the overview lists as "Zuletzt geändert". */
const LATEST = 6;

/**
 * The operator's overview: key figures of customers and contracts, running contracts per
 * division, the migration in one card, the latest contracts and quick links. Each section
 * loads on its own; one that fails shows a notice instead of taking the page down.
 */
export default async function OverviewPage() {
  const session = await requireSession(zonePath());
  const { locale, t } = await dictionary();
  const texts = t.operator.overview;
  const access = accessOf(session);
  if (access === "none") {
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={texts.title} />;
  }

  const [overview, customers, latest, products, migration] = await Promise.all([
    loadOverview(session),
    loadCustomers(session, { limit: 1 }),
    loadContracts(session, { sort: "updatedAt", order: "desc", limit: LATEST }),
    loadProducts(session),
    loadStatus(session),
  ]);
  if (forbidden(overview, customers, latest)) {
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={texts.title} />;
  }

  const today = dayKey(new Date());
  const failed = overview.data === undefined || customers.data === undefined;
  return (
    <Page eyebrow={texts.eyebrow} title={texts.title} lead={texts.lead}>
      <Stack data-testid="operator-overview">
        <PhoneSearch t={t} />
        {access === "pass" && <TenantNotice t={t} accessToken={session.accessToken} />}
        {failed && <Notice tone="error">{t.operator.error}</Notice>}
        <OperatorKpis
          overview={overview.data}
          customers={customers.data?.total}
          t={t}
          locale={locale}
        />
        <CockpitGrid>
          <Stack>
            <Card
              as="section"
              title={texts.latest.title}
              icon="file"
              actions={
                <ZoneLink className="cockpit-small" href={zonePath("/vertraege")}>
                  {texts.latest.all}
                </ZoneLink>
              }
            >
              {latest.data === undefined ? (
                <p className="kp-muted cockpit-small">{t.operator.error}</p>
              ) : (
                <ContractTable
                  testId="latest-contracts"
                  rows={latest.data.items.slice(0, LATEST)}
                  columns={["customer", "tariff", "status", "updated"]}
                  caption={texts.latest.caption}
                  empty={<p className="kp-muted cockpit-small">{texts.latest.empty}</p>}
                  t={t}
                  locale={locale}
                  catalog={catalogOf(products.data?.items)}
                />
              )}
            </Card>
            {overview.data && <DivisionsCard overview={overview.data} t={t} locale={locale} />}
          </Stack>
          <Stack>
            <MigrationCard status={migration.status} t={t} locale={locale} />
            <QuickLinks t={t} in30={addDays(today, 30)} />
          </Stack>
        </CockpitGrid>
      </Stack>
    </Page>
  );
}
