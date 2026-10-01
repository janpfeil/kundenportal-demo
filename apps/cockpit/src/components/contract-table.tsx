/*
 * The contract table of the operator's pages: the list "Verträge", the latest contracts on
 * the overview and the contracts of a customer. Server component; columns are picked by key.
 */

import { type Column, DataTable, StatusBadge, formatDate, formatEuro } from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n";
import {
  type Catalog,
  type ContractSummary,
  optionLabel,
  STATE_TONES,
  contractEnd,
  contractState,
} from "@/lib/contracts";
import { shortId } from "@/lib/money";
import { shortStamp } from "@/lib/time";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";
import { DivisionLabel } from "./operator-ui";

export type ContractColumn =
  | "customer"
  | "contract"
  | "tariff"
  | "product"
  | "installment"
  | "start"
  | "end"
  | "status"
  | "updated";

export const contractHref = (contractId: string) =>
  zonePath(`/vertraege/${encodeURIComponent(contractId)}`);
export const customerHref = (customerId: string) =>
  zonePath(`/kunden/${encodeURIComponent(customerId)}`);

/** The state of a contract as badge: "aktiv", "Kündigung offen", "beendet", "gesperrt". */
export function ContractStateBadge({
  contract,
  t,
}: {
  contract: Pick<ContractSummary, "status" | "termination" | "blocked">;
  t: Dictionary;
}) {
  const state = contractState(contract);
  return (
    <StatusBadge tone={STATE_TONES[state]} data-state={state}>
      {t.operator.states[state]}
    </StatusBadge>
  );
}

/** "31.12.2026" with "gekündigt zum …" below when a notice is pending or took effect. */
export function ContractEnd({
  contract,
  t,
  locale,
}: {
  contract: Pick<ContractSummary, "termination" | "minimumTermEndDate">;
  t: Dictionary;
  locale: Locale;
}) {
  const end = contractEnd(contract);
  const date = formatDate(end.date, locale);
  if (end.kind === "term") return <span className="cockpit-nowrap">{date}</span>;
  const template =
    contract.termination?.kind === "withdrawal"
      ? t.operator.contracts.withdrawnOn
      : t.operator.contracts.terminatedOn;
  return <span className="cockpit-end-notice">{fill(template, { date })}</span>;
}

export function contractColumns(
  keys: readonly ContractColumn[],
  t: Dictionary,
  locale: Locale,
  catalog: Catalog,
  now: Date,
): Column<ContractSummary>[] {
  const c = t.operator.contracts.columns;
  const all: Record<ContractColumn, Column<ContractSummary>> = {
    customer: {
      key: "customer",
      header: c.customer,
      render: (row) => (
        <ZoneLink href={customerHref(row.customerId)} className="cockpit-break">
          {row.customerName ?? row.customerId}
        </ZoneLink>
      ),
    },
    contract: {
      key: "contract",
      header: c.contract,
      render: (row) => (
        <ZoneLink href={contractHref(row.contractId)} className="kp-mono" title={row.contractId}>
          {shortId(row.contractId)}
        </ZoneLink>
      ),
    },
    tariff: {
      key: "tariff",
      header: c.tariff,
      render: (row) => (
        <span>
          <DivisionLabel division={row.division} t={t} />
          <span className="cockpit-sub">
            {row.tariffName} · {optionLabel(catalog, row.productId, row.tariffOption)}
          </span>
        </span>
      ),
    },
    product: {
      key: "product",
      header: c.product,
      render: (row): ReactNode =>
        row.productId ? (
          <span>
            <ZoneLink href={zonePath(`/produkte/${encodeURIComponent(row.productId)}`)}>
              {catalog.get(row.productId)?.name ?? row.productId}
            </ZoneLink>
            {row.productVersion !== undefined && (
              <span className="cockpit-sub">
                {fill(t.operator.contracts.version, { version: row.productVersion })}
              </span>
            )}
          </span>
        ) : (
          t.operator.none
        ),
    },
    installment: {
      key: "installment",
      header: c.installment,
      align: "end",
      render: (row) => (
        <span className="cockpit-nowrap">{formatEuro(row.monthlyInstallmentCent, locale)}</span>
      ),
    },
    start: {
      key: "start",
      header: c.start,
      render: (row) => <span className="cockpit-nowrap">{formatDate(row.startDate, locale)}</span>,
    },
    end: {
      key: "end",
      header: c.end,
      render: (row) => <ContractEnd contract={row} t={t} locale={locale} />,
    },
    status: {
      key: "status",
      header: c.status,
      render: (row) => <ContractStateBadge contract={row} t={t} />,
    },
    updated: {
      key: "updated",
      header: t.columns.updatedAt,
      render: (row) => (
        <time className="kp-mono cockpit-small cockpit-nowrap" dateTime={row.updatedAt}>
          {shortStamp(row.updatedAt, now, locale)}
        </time>
      ),
    },
  };
  return keys.map((key) => all[key]);
}

/** A contract table inside a card (no frame of its own; scrolls between phone and desktop). */
export function ContractTable({
  rows,
  columns,
  caption,
  empty,
  t,
  locale,
  catalog,
  testId,
  wide = false,
}: {
  rows: readonly ContractSummary[];
  columns: readonly ContractColumn[];
  caption: string;
  empty: ReactNode;
  t: Dictionary;
  locale: Locale;
  catalog: Catalog;
  testId: string;
  wide?: boolean | undefined;
}) {
  const table = (
    <DataTable
      data-testid={testId}
      className={wide ? "cockpit-table cockpit-wide" : "cockpit-table"}
      caption={<span className="kp-sr-only">{caption}</span>}
      columns={contractColumns(columns, t, locale, catalog, new Date())}
      rows={rows}
      rowKey={(row) => row.contractId}
      empty={empty}
    />
  );
  return wide ? <div className="cockpit-table-scroll">{table}</div> : table;
}
