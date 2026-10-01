/*
 * The sections of the operator's overview (/cockpit): key figures of customers, contracts,
 * orders and notices, running contracts per division, the migration in one card, and quick
 * links. Server components without data fetching; the page passes what it loaded.
 */

import type { MigrationStatus } from "@kundenportal/api-contract";
import {
  Card,
  Icon,
  Kpi,
  KpiGrid,
  type IconName,
  ProgressRing,
  Sparkline,
  divisionIcon,
  formatNumber,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { Dictionary } from "@/i18n";
import type { OperatorOverview } from "@/lib/admin";
import { progressOf } from "@/lib/cockpit";
import { DIVISIONS, listHref } from "@/lib/filters";
import { MIGRATION_PATH, zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

interface SectionProps {
  t: Dictionary;
  locale: Locale;
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** A date `YYYY-MM-DD` as "29.09." (de) or "29/09" (en) for the spoken trend. */
const dayLabel = (date: string, locale: Locale) => {
  const [, month, day] = date.split("-");
  return locale === "de" ? `${day}.${month}.` : `${day}/${month}`;
};

/** Five key figures: customers, active contracts, pending notices, orders and notices of 7 days. */
export function OperatorKpis({
  overview,
  customers,
  t,
  locale,
}: SectionProps & { overview: OperatorOverview | undefined; customers: number | undefined }) {
  const k = t.operator.overview.kpis;
  const n = (value: number | undefined) =>
    value === undefined ? k.unknown : formatNumber(value, locale);
  const trend = (label: string, values: readonly number[]) =>
    fill(k.trend, {
      label,
      values: values
        .map((value, index) => `${dayLabel(overview?.days[index] ?? "", locale)} ${value}`)
        .join(", "),
    });
  const orders = overview?.orders ?? [];
  const terminations = overview?.terminations ?? [];
  const today = (values: readonly number[]) => values[values.length - 1] ?? 0;
  const blocked = overview?.contracts.blocked ?? 0;
  const ending = overview?.endingSoon ?? 0;
  return (
    <KpiGrid className="cockpit-kpis-5" data-testid="operator-kpis">
      <Kpi
        aria-label={k.customers}
        label={k.customers}
        value={n(customers)}
        hint={k.customersHint}
      />
      <Kpi
        aria-label={k.active}
        label={k.active}
        value={n(overview?.contracts.active)}
        hint={blocked > 0 ? fill(k.blocked, { count: n(blocked) }) : undefined}
      />
      <Kpi
        aria-label={k.pending}
        label={k.pending}
        value={n(overview?.contracts.pendingTermination)}
        delta={
          overview
            ? {
                text: fill(k.endingSoon, { count: n(ending) }),
                tone: ending > 0 ? "bad" : "neutral",
              }
            : undefined
        }
      />
      <Kpi
        aria-label={k.orders}
        label={k.orders}
        value={overview ? n(sum(orders)) : k.unknown}
        delta={
          overview
            ? {
                text: fill(k.today, { count: n(today(orders)) }),
                tone: today(orders) > 0 ? "good" : "neutral",
              }
            : undefined
        }
        aside={overview && <Sparkline values={orders} label={trend(k.orders, orders)} />}
      />
      <Kpi
        aria-label={k.terminations}
        label={k.terminations}
        value={overview ? n(sum(terminations)) : k.unknown}
        delta={
          overview
            ? {
                text: fill(k.today, { count: n(today(terminations)) }),
                tone: today(terminations) > 0 ? "bad" : "neutral",
              }
            : undefined
        }
        aside={
          overview && (
            <Sparkline values={terminations} label={trend(k.terminations, terminations)} />
          )
        }
      />
    </KpiGrid>
  );
}

/** Running contracts per division as bars; the number next to each bar is the value. */
export function DivisionsCard({
  overview,
  t,
  locale,
}: SectionProps & { overview: OperatorOverview }) {
  const texts = t.operator.overview.divisions;
  const counts = DIVISIONS.map((division) => ({
    division,
    count: overview.byDivision[division] ?? 0,
  }));
  const top = Math.max(...counts.map((entry) => entry.count), 0);
  return (
    <Card as="section" title={texts.title} icon="chart">
      {top === 0 ? (
        <p className="kp-muted cockpit-small">{texts.empty}</p>
      ) : (
        <ul className="cockpit-bars" data-testid="division-bars">
          {counts.map(({ division, count }) => (
            <li key={division} data-division={division} data-count={count}>
              <ZoneLink
                className="cockpit-bar-label"
                href={listHref(
                  zonePath("/vertraege"),
                  { division, status: "active" },
                  undefined,
                  {},
                )}
              >
                <Icon name={divisionIcon(division)} />
                {t.operator.divisions[division]}
              </ZoneLink>
              <span className="cockpit-bar-track" aria-hidden="true">
                <span style={{ width: `${Math.round((count / top) * 1000) / 10}%` }} />
              </span>
              <span className="cockpit-bar-value">
                {count === 1
                  ? texts.valueOne
                  : fill(texts.value, { count: formatNumber(count, locale) })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The migration in one card: a small ring per legacy system, open cases, link to the area. */
export function MigrationCard({
  status,
  t,
  locale,
}: SectionProps & { status: MigrationStatus | undefined }) {
  const texts = t.operator.overview.migration;
  const n = (value: number) => formatNumber(value, locale);
  return (
    <Card
      as="section"
      title={texts.title}
      icon="refresh"
      data-testid="migration-summary"
      actions={
        <ZoneLink className="cockpit-small" href={MIGRATION_PATH}>
          {texts.open}
        </ZoneLink>
      }
    >
      {status === undefined ? (
        <p className="kp-muted cockpit-small">{texts.error}</p>
      ) : (
        <>
          <ul className="cockpit-systems">
            {status.systems.map((system) => {
              const progress = progressOf(system);
              const name = t.systems[progress.system];
              const known = progress.total !== undefined;
              const line = known
                ? fill(texts.done, { done: n(progress.done), total: n(progress.total ?? 0) })
                : fill(texts.doneUnknown, { done: n(progress.done) });
              return (
                <li key={progress.system}>
                  <ProgressRing
                    value={progress.done}
                    max={progress.total ?? 0}
                    size={64}
                    label={`${name}: ${line}`}
                    center={known ? `${progress.percent} %` : "–"}
                  />
                  <span>
                    <strong>{name}</strong>
                    <span className="cockpit-sub">{line}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="cockpit-small">
            <ZoneLink href={`${MIGRATION_PATH}#klaerfaelle`}>
              {fill(texts.cases, {
                clarifications: n(status.clarifications.length),
                deadLetters: n(status.deadLetters.length),
              })}
            </ZoneLink>
          </p>
        </>
      )}
    </Card>
  );
}

/** Ways into the daily work: find customers, pending notices, products, clarification cases. */
export function QuickLinks({ t, in30 }: { t: Dictionary; in30: string }) {
  const texts = t.operator.overview.links;
  const links: { href: string; label: string; icon: IconName }[] = [
    { href: zonePath("/kunden"), label: texts.customers, icon: "users" },
    {
      href: listHref(zonePath("/vertraege"), { status: "pending-termination" }, undefined, {}),
      label: texts.pending,
      icon: "logout",
    },
    {
      href: listHref(zonePath("/vertraege"), { endsBefore: in30, sort: "end" }, undefined, {}),
      label: texts.ending,
      icon: "clock",
    },
    { href: zonePath("/produkte"), label: texts.products, icon: "chart" },
    { href: zonePath("/produkte/neu"), label: texts.newProduct, icon: "plus" },
    { href: `${MIGRATION_PATH}#klaerfaelle`, label: texts.clarifications, icon: "alert" },
  ];
  return (
    <Card as="section" title={texts.title}>
      <ul className="cockpit-links">
        {links.map((link) => (
          <li key={link.href}>
            <ZoneLink href={link.href}>
              <Icon name={link.icon} />
              {link.label}
            </ZoneLink>
          </li>
        ))}
      </ul>
    </Card>
  );
}
