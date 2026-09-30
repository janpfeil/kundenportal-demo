import {
  Badge,
  type BadgeProps,
  ButtonLink,
  Card,
  type Column,
  DataTable,
  Notice,
  Page,
  formatDateTime,
} from "@kundenportal/ui";
import { InvitationForm } from "@/components/invitation-form";
import { RevokeButton } from "@/components/revoke-button";
import { SettingsPanel } from "@/components/settings-panel";
import { dictionary } from "@/i18n";
import { requireSession } from "@kundenportal/web-auth/pages";
import {
  type PassStatus,
  type PassSummary,
  accessOf,
  isRevocable,
  fetchSettings,
  listPasses,
} from "@/lib/tenancy";
import { fill } from "@kundenportal/ui/i18n";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

const TONES: Record<PassStatus, NonNullable<BadgeProps["tone"]>> = {
  provisioning: "accent",
  active: "success",
  "quota-exceeded": "warning",
  "tearing-down": "neutral",
  deleted: "neutral",
};

/** Owner area "Demo-Pässe": create invitations, watch and revoke passes. */
export default async function PassesPage() {
  const session = await requireSession(zonePath("/paesse"));
  const { locale, t } = await dictionary();
  const texts = t.passes;
  const back = (
    <ButtonLink href={zonePath()} variant="secondary" linkComponent={ZoneLink}>
      {t.access.toCockpit}
    </ButtonLink>
  );
  if (accessOf(session) !== "owner") {
    return (
      <Page title={texts.title} actions={back}>
        <Notice tone="warning" data-testid="passes-forbidden">
          {texts.ownerOnly}
        </Notice>
      </Page>
    );
  }

  const [passes, settings] = await Promise.all([listPasses(session), fetchSettings(session)]);
  const used = (pass: PassSummary, kind: "api" | "events" | "uploads") => {
    const quota = pass.quotas[kind];
    return quota ? `${quota.used}/${quota.limit}` : "–";
  };
  const columns: Column<PassSummary>[] = [
    {
      key: "email",
      header: texts.list.email,
      render: (pass) => <span className="zone-break">{pass.email}</span>,
    },
    { key: "tenant", header: texts.list.tenant, render: (pass) => <code>{pass.tenantId}</code> },
    {
      key: "status",
      header: texts.list.status,
      render: (pass) => (
        <span data-testid="pass-status" data-status={pass.status}>
          <Badge tone={TONES[pass.status] ?? "neutral"}>
            {texts.statuses[pass.status] ?? pass.status}
          </Badge>
        </span>
      ),
    },
    {
      key: "quotas",
      header: texts.list.quotas,
      render: (pass) =>
        fill(texts.list.quotaText, {
          api: used(pass, "api"),
          events: used(pass, "events"),
          uploads: used(pass, "uploads"),
        }),
    },
    {
      key: "validUntil",
      header: texts.list.validUntil,
      render: (pass) => formatDateTime(pass.validUntil, locale, "medium"),
    },
    {
      key: "action",
      header: texts.list.action,
      render: (pass) =>
        isRevocable(pass.status) ? <RevokeButton passId={pass.passId} texts={texts.revoke} /> : "",
    },
  ];

  return (
    <Page title={texts.title} lead={texts.lead} actions={back}>
      <Card title={texts.settings.title}>
        <p className="kp-muted">{texts.settings.intro}</p>
        {settings === undefined ? (
          <Notice tone="error">{texts.settings.error}</Notice>
        ) : (
          <SettingsPanel settings={settings} texts={texts.settings} locale={locale} />
        )}
      </Card>

      <Card title={texts.invite.title} className="zone-section">
        <p className="kp-muted">{texts.invite.intro}</p>
        <InvitationForm texts={texts.invite} locale={locale} />
      </Card>

      <Card title={texts.list.title} className="zone-section">
        {passes === undefined ? (
          <Notice tone="error">{texts.error}</Notice>
        ) : (
          <DataTable
            data-testid="passes"
            caption={texts.list.caption}
            columns={columns}
            rows={[...passes].sort((a, b) => b.validUntil.localeCompare(a.validUntil))}
            rowKey={(pass) => pass.passId}
            empty={
              <p className="kp-muted" data-testid="passes">
                {texts.list.empty}
              </p>
            }
          />
        )}
      </Card>
    </Page>
  );
}
