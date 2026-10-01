import { ButtonLink, Card, CockpitGrid, DataTable, Notice, Page, Stack } from "@kundenportal/ui";
import { requireSession } from "@kundenportal/web-auth/pages";
import { InvitationForm } from "@/components/invitation-form";
import { PassKpis, passColumns } from "@/components/passes";
import { SettingsPanel } from "@/components/settings-panel";
import { dictionary } from "@/i18n";
import { passRows } from "@/lib/passes";
import { accessOf, fetchOverview, fetchSettings, listPasses } from "@/lib/tenancy";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

/** Owner area "Demo-Pässe" (mockup screen "paesse"): key figures, passes, invite, settings. */
export default async function PassesPage() {
  const session = await requireSession(zonePath("/paesse"));
  const { locale, t } = await dictionary();
  const texts = t.passes;
  if (accessOf(session) !== "owner") {
    return (
      <Page
        eyebrow={texts.eyebrow}
        title={texts.title}
        actions={
          <ButtonLink href={zonePath()} variant="secondary" linkComponent={ZoneLink}>
            {t.access.toCockpit}
          </ButtonLink>
        }
      >
        <Notice tone="warning" data-testid="passes-forbidden">
          {texts.ownerOnly}
        </Notice>
      </Page>
    );
  }

  const [passes, settings, overview] = await Promise.all([
    listPasses(session),
    fetchSettings(session),
    fetchOverview(session),
  ]);
  const now = new Date();
  const rows = passes === undefined ? undefined : passRows(passes, overview?.invitations ?? []);
  const columns = passColumns(texts, t.time, locale, now);

  return (
    <Page eyebrow={texts.eyebrow} title={texts.title} lead={texts.lead}>
      <Stack>
        {overview === undefined && <Notice tone="error">{texts.overviewError}</Notice>}
        <PassKpis
          overview={overview}
          settings={settings}
          passes={passes}
          texts={texts}
          locale={locale}
        />
        <Card
          as="section"
          title={texts.list.title}
          actions={<span className="kp-muted cockpit-small">{texts.list.order}</span>}
        >
          {rows === undefined ? (
            <Notice tone="error">{texts.error}</Notice>
          ) : (
            <div className="cockpit-table-scroll">
              <DataTable
                data-testid="passes"
                className="cockpit-table cockpit-passes"
                caption={<span className="kp-sr-only">{texts.list.caption}</span>}
                columns={columns}
                rows={rows}
                rowKey={(row) => row.key}
                empty={
                  <p className="kp-muted cockpit-small" data-testid="passes">
                    {texts.list.empty}
                  </p>
                }
              />
            </div>
          )}
        </Card>
        <CockpitGrid className="cockpit-pass-grid">
          <Card as="section" title={texts.invite.title}>
            <p className="kp-muted cockpit-small">{texts.invite.intro}</p>
            <InvitationForm texts={texts.invite} locale={locale} />
          </Card>
          <Card as="section" id="einstellungen" title={texts.settings.title}>
            {settings === undefined ? (
              <Notice tone="error">{texts.settings.error}</Notice>
            ) : (
              <SettingsPanel settings={settings} texts={texts.settings} locale={locale} />
            )}
          </Card>
        </CockpitGrid>
      </Stack>
    </Page>
  );
}
