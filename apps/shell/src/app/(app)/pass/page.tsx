import {
  ButtonLink,
  Card,
  type Column,
  DataTable,
  Icon,
  Meter,
  Notice,
  Page,
  ProgressRing,
  Split,
  Stack,
  StatusBadge,
  type StatusTone,
  formatNumber,
} from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { CopyButton } from "@/components/copy-button";
import { type Dictionary, dictionary } from "@/i18n";
import { type PassRing, TIME_ZONE, passRing, quotaShare } from "@/lib/overview";
import { readSession } from "@/lib/session";
import {
  type PassStatus,
  type PassView,
  QUOTA_KINDS,
  fetchPass,
  fetchPassHours,
} from "@/lib/tenancy";

export const dynamic = "force-dynamic";

type Texts = Dictionary["pass"];

/** "noch 31 Std." or "noch 3 Min." (test passes last minutes), in the ring's unit. */
function remaining(ring: PassRing, texts: Texts): string {
  if (ring.unit === "days") return fill(texts.daysLeft, { days: ring.amount });
  if (ring.unit === "hours") return fill(texts.hoursLeft, { hours: ring.amount });
  return fill(texts.minutesLeft, { minutes: ring.amount });
}

/** Ends a text with a full stop unless an abbreviation already does ("noch 31 Std."). */
function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

const TONES: Record<PassStatus, StatusTone> = {
  provisioning: "info",
  active: "ok",
  "quota-exceeded": "warn",
  "tearing-down": "warn",
  deleted: "neutral",
};

/** Quotas with their numbers; the warning names the fullest one from 80 % on. */
function Quotas({ pass, texts, locale }: { pass: PassView; texts: Texts; locale: "de" | "en" }) {
  const quotas = QUOTA_KINDS.flatMap((kind) => {
    const quota = pass.quotas[kind];
    return quota ? [{ kind, ...quota, share: quotaShare(quota.used, quota.limit) }] : [];
  });
  const fullest = [...quotas].sort((a, b) => b.share - a.share)[0];
  const n = (value: number) => formatNumber(value, locale);
  return (
    <Card as="section" title={texts.quotaTitle}>
      <Stack data-testid="pass-quotas">
        {quotas.map((quota) => (
          <Meter
            key={quota.kind}
            data-quota={quota.kind}
            label={texts.quotas[quota.kind]}
            value={quota.used}
            max={quota.limit}
            valueText={fill(texts.quotaLine, {
              used: n(quota.used),
              limit: n(quota.limit),
              left: n(Math.max(0, quota.limit - quota.used)),
            })}
          />
        ))}
        {fullest && fullest.share >= 80 && (
          <Notice tone="warning">
            {fill(texts.quotaWarning, {
              name: texts.quotas[fullest.kind],
              percent: Math.min(fullest.share, 100),
            })}
          </Notice>
        )}
      </Stack>
    </Card>
  );
}

type Person = NonNullable<PassView["demoPersons"]>[number];

function Persons({ pass, texts }: { pass: PassView; texts: Texts }) {
  const persons = pass.demoPersons ?? [];
  if (persons.length === 0 && !pass.demoPassword) return null;
  const columns: Column<Person>[] = [
    {
      key: "name",
      header: texts.personName,
      render: (person) => (
        <>
          {person.name}
          {person.system && (
            <span className="pass-person-system">{texts.systems[person.system]}</span>
          )}
        </>
      ),
    },
    {
      key: "login",
      header: texts.personLogin,
      render: (person) => <span className="kp-mono pass-login">{person.login}</span>,
    },
  ];
  return (
    <Card as="section" title={texts.personsTitle}>
      <p className="kp-muted">{texts.personsIntro}</p>
      {persons.length > 0 && (
        <DataTable
          data-testid="demo-persons"
          caption={texts.personsTitle}
          className="pass-persons"
          columns={columns}
          rows={persons}
          rowKey={(person) => person.login}
        />
      )}
      {pass.demoPassword && (
        <div className="pass-password" role="group" aria-labelledby="pass-password-label">
          <span className="kp-label" id="pass-password-label">
            {texts.password}
          </span>
          <div className="pass-secret">
            <code data-testid="demo-password">{pass.demoPassword}</code>
            <CopyButton value={pass.demoPassword} label={texts.copyPassword} texts={texts} />
          </div>
        </div>
      )}
    </Card>
  );
}

/** Status of the signed-in holder's demo pass: setup, quota, demo persons and password. */
export default async function PassPage() {
  const session = await readSession();
  if (!session) redirect("/auth/login?returnTo=/pass");
  const [{ locale, t }, lookup, passHours] = await Promise.all([
    dictionary(),
    fetchPass(session),
    fetchPassHours(),
  ]);
  const texts = t.pass;
  const refresh = (
    <ButtonLink href="/pass" variant="secondary">
      <Icon name="refresh" />
      {texts.refresh}
    </ButtonLink>
  );

  if (lookup.kind === "owner") {
    return (
      <Page title={texts.title}>
        <Notice tone="info" data-testid="pass-owner">
          {texts.owner}
        </Notice>
      </Page>
    );
  }
  if (lookup.kind === "error") {
    return (
      <Page title={texts.title} actions={refresh}>
        <Notice tone="error">{texts.error}</Notice>
      </Page>
    );
  }

  const { pass } = lookup;
  const end = Date.parse(pass.validUntil);
  const date = Number.isNaN(end)
    ? pass.validUntil
    : new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: TIME_ZONE,
      }).format(end);
  const ring = passRing(pass.validUntil, passHours);
  const usable = pass.status === "active" || pass.status === "quota-exceeded";
  const detail = texts.statusText[pass.status];

  return (
    <Page title={texts.title} lead={texts.lead}>
      {pass.status === "provisioning" && <AutoRefresh seconds={5} />}
      <Stack gap="large">
        <Card as="section" className="pass-hero" aria-label={texts.status}>
          <ProgressRing
            size={128}
            value={ring.value}
            max={ring.max}
            center={fill(texts.ring[ring.unit], { amount: ring.amount })}
            sub={fill(texts.ring.of, { total: ring.totalHours })}
            label={fill(texts.ring.label, {
              left: remaining(ring, texts),
              total: ring.totalHours,
            })}
          />
          <div className="pass-hero-body">
            <div className="pass-hero-status">
              <StatusBadge
                role="status"
                tone={TONES[pass.status]}
                pulse={pass.status === "active" || pass.status === "provisioning"}
                data-testid="pass-status"
                data-status={pass.status}
              >
                {texts.statuses[pass.status]}
              </StatusBadge>
              <span className="kp-muted">
                {texts.tenant}{" "}
                <span className="kp-mono" data-testid="pass-tenant">
                  {pass.tenantId}
                </span>
              </span>
            </div>
            <h2>{texts.headlines[pass.status]}</h2>
            {detail && <p>{detail}</p>}
            <p className="kp-muted">
              {fill(texts.validUntil, { date })} — {sentence(remaining(ring, texts))}{" "}
              <span data-testid="pass-deletion">{texts.deletion}</span>
            </p>
            <div className="pass-hero-actions">
              {usable && (
                <ButtonLink href="/cockpit">
                  {texts.cockpit}
                  <Icon name="right" />
                </ButtonLink>
              )}
              {refresh}
            </div>
          </div>
        </Card>
        <Split>
          <Quotas pass={pass} texts={texts} locale={locale} />
          <Persons pass={pass} texts={texts} />
        </Split>
      </Stack>
    </Page>
  );
}
