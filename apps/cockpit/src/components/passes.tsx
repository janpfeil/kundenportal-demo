/*
 * Building blocks of the pass administration (mockup screen "paesse"): the key figures and
 * the columns of the pass table. Server components without data fetching.
 */

import {
  type Column,
  Kpi,
  KpiGrid,
  Meter,
  MiniBars,
  Sparkline,
  StatusBadge,
  formatNumber,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { Dictionary } from "@/i18n";
import { PASS_TONES, type PassRow, QUOTA_KINDS, neverSignedIn, quotaPercent } from "@/lib/passes";
import type { TenancySettings } from "@/lib/settings";
import { type PassOverview, type PassSummary, isRevocable } from "@/lib/tenancy";
import { type RelativeTexts, dayStamp, relativeTime } from "@/lib/time";
import { RevokeButton } from "./revoke-button";

type Texts = Dictionary["passes"];

/** Key figures: active tenants of the cap, open invitations, never signed in, API calls today. */
export function PassKpis({
  overview,
  settings,
  passes,
  texts,
  locale,
}: {
  overview: PassOverview | undefined;
  settings: TenancySettings | undefined;
  passes: readonly PassSummary[] | undefined;
  texts: Texts;
  locale: Locale;
}) {
  const n = (value: number | undefined) =>
    value === undefined ? texts.kpis.unknown : formatNumber(value, locale);
  const active = overview?.activeTenants ?? settings?.activeTenants;
  const max = overview?.maxTenants ?? settings?.maxTenants;
  const never = overview?.neverSignedIn ?? (passes ? neverSignedIn(passes) : undefined);
  const calls = overview?.apiCalls.days.map((day) => day.calls) ?? [];
  return (
    <KpiGrid data-testid="pass-kpis">
      <Kpi
        label={texts.kpis.active}
        value={n(active)}
        of={max === undefined ? undefined : `/ ${n(max)}`}
      >
        {active !== undefined && max !== undefined && (
          <Meter label={texts.kpis.active} value={active} max={max} thin hideLabel warnAt={1} />
        )}
      </Kpi>
      <Kpi
        label={texts.kpis.invitations}
        value={n(overview?.openInvitations)}
        hint={
          overview ? fill(texts.kpis.invitationDays, { days: overview.invitationDays }) : undefined
        }
      />
      <Kpi
        label={texts.kpis.neverSignedIn}
        value={n(never)}
        hint={overview ? fill(texts.kpis.reminder, { hours: overview.reminderHours }) : undefined}
      />
      <Kpi
        label={texts.kpis.apiCalls}
        value={n(overview?.apiCalls.today)}
        aside={
          calls.length > 0 ? (
            <Sparkline
              values={calls}
              label={fill(texts.kpis.apiTrend, { values: calls.join(", ") })}
            />
          ) : undefined
        }
      />
    </KpiGrid>
  );
}

/** The table's columns for passes and open invitations (one row type, see passRows). */
export function passColumns(
  texts: Texts,
  time: RelativeTexts,
  locale: Locale,
  now: Date,
): Column<PassRow>[] {
  const list = texts.list;
  const muted = (text: string) => <span className="kp-muted">{text}</span>;
  const quotaNames = {
    api: [list.quotaApi, list.quotaApiName],
    events: [list.quotaEvents, list.quotaEventsName],
    uploads: [list.quotaUploads, list.quotaUploadsName],
  } as const;
  return [
    {
      key: "email",
      header: list.email,
      render: (row) => <span className="cockpit-break">{row.email}</span>,
    },
    {
      key: "tenant",
      header: list.tenant,
      render: (row) =>
        row.kind === "pass" ? (
          <span className="kp-mono">{row.pass.tenantId}</span>
        ) : (
          muted(list.none)
        ),
    },
    {
      key: "status",
      header: list.status,
      render: (row) =>
        row.kind === "pass" ? (
          <span data-testid="pass-status" data-status={row.pass.status}>
            <StatusBadge tone={PASS_TONES[row.pass.status] ?? "neutral"}>
              {texts.statuses[row.pass.status] ?? row.pass.status}
            </StatusBadge>
          </span>
        ) : (
          <span data-testid="pass-status" data-status="invited">
            <StatusBadge tone="info">{list.invitation}</StatusBadge>
          </span>
        ),
    },
    {
      key: "activatedAt",
      header: list.activatedAt,
      render: (row) => {
        const at = row.kind === "pass" ? row.pass.activatedAt : undefined;
        return (
          <span
            data-testid="pass-activated"
            className={at ? "cockpit-small cockpit-nowrap" : "cockpit-small kp-muted"}
          >
            {at ? dayStamp(at, locale) : list.never}
          </span>
        );
      },
    },
    {
      key: "lastActiveAt",
      header: list.lastActiveAt,
      render: (row) => {
        const at = row.kind === "pass" ? row.pass.lastActiveAt : undefined;
        return (
          <span
            data-testid="pass-last-active"
            className={at ? "cockpit-small cockpit-nowrap" : "cockpit-small kp-muted"}
          >
            {at ? <time dateTime={at}>{relativeTime(at, now, time, locale)}</time> : list.never}
          </span>
        );
      },
    },
    {
      key: "quotas",
      header: list.quotas,
      render: (row) => {
        if (row.kind !== "pass") return muted(list.none);
        const pass = row.pass;
        const items = QUOTA_KINDS.flatMap((kind) => {
          const percent = quotaPercent(pass, kind);
          const quota = pass.quotas[kind];
          if (percent === undefined || !quota) return [];
          const [label] = quotaNames[kind];
          return [
            {
              label,
              percent,
              valueText: `${quotaNames[kind][1]}: ${fill(list.quotaValue, {
                used: formatNumber(quota.used, locale),
                limit: formatNumber(quota.limit, locale),
                percent,
              })}`,
            },
          ];
        });
        return items.length > 0 ? <MiniBars items={items} /> : muted(list.none);
      },
    },
    {
      key: "validUntil",
      header: list.validUntil,
      render: (row) => (
        <span className="cockpit-small cockpit-nowrap">
          {dayStamp(row.kind === "pass" ? row.pass.validUntil : row.invitation.expiresAt, locale)}
        </span>
      ),
    },
    {
      key: "action",
      header: list.action,
      align: "end",
      render: (row) =>
        row.kind === "pass" && isRevocable(row.pass.status) ? (
          <RevokeButton passId={row.pass.passId} email={row.pass.email} texts={texts.revoke} />
        ) : null,
    },
  ];
}
