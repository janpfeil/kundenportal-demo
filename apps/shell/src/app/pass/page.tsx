import {
  ButtonLink,
  Card,
  type Column,
  DataTable,
  Facts,
  Meter,
  Notice,
  Page,
  type Tone,
} from "@kundenportal/ui";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { CopyButton } from "@/components/copy-button";
import { dictionary } from "@/i18n";
import { readSession } from "@/lib/session";
import { type PassStatus, QUOTA_KINDS, fetchPass, fill, timeLeft } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

/** "noch 6 Tage", "noch 5 Std." or "noch 3 Min." — test passes last minutes. */
function remaining(
  validUntil: string,
  texts: { daysLeft: string; hoursLeft: string; minutesLeft: string },
): string {
  const { unit, value } = timeLeft(validUntil);
  if (unit === "days") return fill(texts.daysLeft, { days: value });
  if (unit === "hours") return fill(texts.hoursLeft, { hours: value });
  return fill(texts.minutesLeft, { minutes: value });
}

const TONES: Record<PassStatus, Tone> = {
  provisioning: "info",
  active: "success",
  "quota-exceeded": "warning",
  "tearing-down": "warning",
  deleted: "warning",
};

type Person = { name: string; login: string };

/** Status of the signed-in holder's demo pass: setup, quota, demo persons and password. */
export default async function PassPage() {
  const session = await readSession();
  if (!session) redirect("/auth/login?returnTo=/pass");
  const [{ locale, t }, lookup] = await Promise.all([dictionary(), fetchPass(session)]);
  const texts = t.pass;
  const refresh = (
    <ButtonLink href="/pass" variant="secondary">
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
  const validUntil = Date.parse(pass.validUntil);
  const date = Number.isNaN(validUntil)
    ? pass.validUntil
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
        validUntil,
      );
  const number = new Intl.NumberFormat(locale);
  const persons = pass.demoPersons ?? [];
  const columns: Column<Person>[] = [
    { key: "name", header: texts.personName, render: (person) => person.name },
    {
      key: "login",
      header: texts.personLogin,
      render: (person) => <code className="pass-secret">{person.login}</code>,
    },
  ];

  return (
    <Page title={texts.title} lead={texts.lead} actions={refresh}>
      {pass.status === "provisioning" && <AutoRefresh seconds={5} />}
      <Notice
        tone={TONES[pass.status]}
        title={texts.statuses[pass.status]}
        data-testid="pass-status"
        data-status={pass.status}
      >
        {texts.statusText[pass.status]}
      </Notice>

      <Facts
        items={[
          {
            term: texts.tenant,
            description: <code data-testid="pass-tenant">{pass.tenantId}</code>,
            id: "tenant",
          },
          {
            term: texts.validUntil,
            description: `${date} (${remaining(pass.validUntil, texts)})`,
          },
        ]}
      />

      <Card title={texts.quotaTitle}>
        <div data-testid="pass-quotas">
          {QUOTA_KINDS.map((kind) => {
            const quota = pass.quotas[kind];
            if (!quota) return null;
            const left = Math.max(0, quota.limit - quota.used);
            return (
              <Meter
                key={kind}
                data-quota={kind}
                label={texts.quotas[kind]}
                value={quota.used}
                max={quota.limit}
                valueText={fill(texts.quotaLine, {
                  left: number.format(left),
                  limit: number.format(quota.limit),
                  date,
                })}
              />
            );
          })}
        </div>
      </Card>

      {(persons.length > 0 || pass.demoPassword) && (
        <Card title={texts.personsTitle}>
          <p className="kp-muted">{texts.personsIntro}</p>
          {persons.length > 0 && (
            <DataTable
              data-testid="demo-persons"
              caption={texts.personsTitle}
              columns={columns}
              rows={persons}
              rowKey={(person) => person.login}
            />
          )}
          {pass.demoPassword && (
            <p className="pass-password">
              <strong>{texts.password}:</strong>{" "}
              <code className="pass-secret" data-testid="demo-password">
                {pass.demoPassword}
              </code>{" "}
              <CopyButton value={pass.demoPassword} label={texts.copyPassword} texts={texts} />
            </p>
          )}
        </Card>
      )}

      {(pass.status === "active" || pass.status === "quota-exceeded") && (
        <p>
          <ButtonLink href="/cockpit" variant="secondary">
            {texts.cockpit}
          </ButtonLink>
        </p>
      )}
      <p className="kp-muted" data-testid="pass-deletion">
        {texts.deletion}
      </p>
    </Page>
  );
}
