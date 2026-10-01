/*
 * A contract as the operator sees it: its facts, its state with the notes on a pending
 * termination or a block, and its history as timeline. Server components; the page loads.
 */

import {
  Facts,
  Timeline,
  type TimelineItem,
  formatDataVolume,
  formatDate,
  formatDateTime,
  formatEuro,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n";
import {
  type Catalog,
  HISTORY_LOOKS,
  type HistoryEntry,
  type OperatorContract,
  optionLabel,
} from "@/lib/contracts";
import { formatWorkPrice } from "@/lib/money";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";
import { ContractStateBadge, customerHref } from "./contract-table";
import { DivisionLabel } from "./operator-ui";

interface Props {
  contract: OperatorContract;
  t: Dictionary;
  locale: Locale;
}

/** The price of the current option: work and base price (metered), else the monthly price. */
function price(contract: OperatorContract, t: Dictionary, locale: Locale): ReactNode {
  const f = t.operator.contract.facts;
  const parts: string[] = [];
  if (contract.workPriceCent !== undefined && contract.unit !== undefined) {
    parts.push(formatWorkPrice(contract.workPriceCent, contract.unit, locale));
    parts.push(fill(f.basePrice, { price: formatEuro(contract.monthlyPriceCent, locale) }));
  } else {
    parts.push(fill(f.monthly, { price: formatEuro(contract.monthlyPriceCent, locale) }));
  }
  if (contract.dataVolumeMb !== undefined)
    parts.push(fill(f.dataVolume, { volume: formatDataVolume(contract.dataVolumeMb, locale) }));
  return parts.join(" · ");
}

export function ContractFacts({ contract, t, locale, catalog }: Props & { catalog: Catalog }) {
  const f = t.operator.contract.facts;
  const date = (value: string) => formatDate(value, locale);
  const product = contract.productId ? catalog.get(contract.productId) : undefined;
  const installment = formatEuro(contract.monthlyInstallmentCent, locale);
  const range =
    contract.installmentMinCent !== undefined && contract.installmentMaxCent !== undefined
      ? ` (${fill(f.installmentRange, {
          min: formatEuro(contract.installmentMinCent, locale),
          max: formatEuro(contract.installmentMaxCent, locale),
        })})`
      : "";
  const items = [
    {
      term: f.customer,
      description: (
        <ZoneLink href={customerHref(contract.customerId)} className="cockpit-break">
          {contract.customerName ?? contract.customerId}
        </ZoneLink>
      ),
    },
    { term: f.division, description: <DivisionLabel division={contract.division} t={t} /> },
    {
      term: f.product,
      description: contract.productId ? (
        <ZoneLink href={zonePath(`/produkte/${encodeURIComponent(contract.productId)}`)}>
          {product?.name ?? contract.tariffName}
        </ZoneLink>
      ) : (
        contract.tariffName
      ),
    },
    {
      term: f.option,
      description: optionLabel(catalog, contract.productId, contract.tariffOption),
    },
    ...(contract.productVersion !== undefined
      ? [{ term: f.version, description: String(contract.productVersion) }]
      : []),
    { term: f.installment, description: `${installment}${range}` },
    { term: f.price, description: price(contract, t, locale) },
    ...(contract.meterNumber
      ? [{ term: f.meter, description: <span className="kp-mono">{contract.meterNumber}</span> }]
      : []),
    { term: f.start, description: date(contract.startDate) },
    {
      term: f.term,
      description: fill(f.termValue, {
        months: contract.minimumTermMonths,
        date: date(contract.minimumTermEndDate),
      }),
    },
    ...(contract.noticePeriodMonths !== undefined
      ? [
          {
            term: f.notice,
            description: fill(f.noticeValue, { months: contract.noticePeriodMonths }),
          },
        ]
      : []),
    ...(contract.earliestTerminationDate && contract.status === "active"
      ? [{ term: f.earliest, description: date(contract.earliestTerminationDate) }]
      : []),
    ...(contract.withdrawableUntil
      ? [{ term: f.withdrawable, description: date(contract.withdrawableUntil) }]
      : []),
    { term: f.updated, description: formatDateTime(contract.updatedAt, locale) },
  ];
  return <Facts className="cockpit-facts" items={items} />;
}

/** The state badge and, below it, what is pending: notice, its reason, a block. */
export function ContractStatus({ contract, t, locale }: Props) {
  const texts = t.operator.contract;
  const termination = contract.termination;
  return (
    <div className="cockpit-status" data-testid="contract-status">
      <div className="cockpit-row">
        <ContractStateBadge contract={contract} t={t} />
        {termination && (
          <span className="cockpit-end-notice">
            {fill(
              termination.kind === "withdrawal"
                ? t.operator.contracts.withdrawnOn
                : t.operator.contracts.terminatedOn,
              { date: formatDate(termination.effectiveDate, locale) },
            )}
          </span>
        )}
      </div>
      {termination && (
        <p className="kp-muted cockpit-small">
          {fill(texts.terminationNote, {
            by: texts.terminatedBy[termination.by],
            date: formatDateTime(termination.requestedAt, locale),
          })}
          {termination.reason &&
            ` · ${fill(t.operator.history.reason, { reason: termination.reason })}`}
        </p>
      )}
      {contract.blocked && <p className="cockpit-small cockpit-blocked">{texts.blockedNote}</p>}
    </div>
  );
}

/** History entries as timeline items: what changed, who, why, when. */
export function historyItems(
  entries: readonly HistoryEntry[],
  t: Dictionary,
  locale: Locale,
): TimelineItem[] {
  const texts = t.operator.history;
  return entries.map((entry, index) => {
    const look = HISTORY_LOOKS[entry.change] ?? { icon: "info", tone: "neutral" };
    const meta: ReactNode[] = [texts.by[entry.by] ?? entry.by];
    if (entry.summary) meta.push(entry.summary);
    if (entry.reason) meta.push(fill(texts.reason, { reason: entry.reason }));
    return {
      id: `${entry.at}-${index}`,
      icon: look.icon,
      tone: look.tone,
      title: texts.changes[entry.change] ?? entry.change,
      meta,
      time: <time dateTime={entry.at}>{formatDateTime(entry.at, locale)}</time>,
    };
  });
}

export function ContractHistory({
  history,
  t,
  locale,
}: {
  history: readonly HistoryEntry[];
  t: Dictionary;
  locale: Locale;
}) {
  const texts = t.operator.history;
  if (history.length === 0)
    return (
      <p className="kp-muted cockpit-small" data-testid="contract-history">
        {texts.empty}
      </p>
    );
  return (
    <Timeline
      data-testid="contract-history"
      aria-label={texts.caption}
      items={historyItems(history, t, locale)}
    />
  );
}
