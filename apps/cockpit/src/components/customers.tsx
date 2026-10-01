/*
 * The customer list and the sections of a customer's page: table, facts, meter readings,
 * documents and the mailbox (read only). Server components without data fetching.
 */

import type { Division } from "@kundenportal/api-contract";
import {
  Badge,
  type Column,
  DataTable,
  Facts,
  Icon,
  StatusBadge,
  type StatusTone,
  divisionIcon,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatQuantity,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { Dictionary } from "@/i18n";
import type { CustomerDocument, CustomerSummary, MeterReading, Notification } from "@/lib/admin";
import { ZoneLink } from "@/lib/zone-link";
import { customerHref } from "./contract-table";

/** The badge of a customer's origin; legacy accounts are told apart from registrations. */
export function OriginBadge({ origin, t }: { origin: CustomerSummary["origin"]; t: Dictionary }) {
  return (
    <Badge tone={origin === "registration" ? "neutral" : "accent"}>
      {t.operator.origins[origin]}
    </Badge>
  );
}

/** The divisions with a running contract as icons; their names for screen readers and tooltip. */
export function DivisionIcons({ divisions, t }: { divisions: readonly Division[]; t: Dictionary }) {
  if (divisions.length === 0)
    return <span className="kp-muted cockpit-small">{t.operator.customers.noDivisions}</span>;
  return (
    <span className="cockpit-icons">
      {divisions.map((division) => (
        // The label names the icon; the tooltip shows it to sighted visitors.
        <span key={division} title={t.operator.divisions[division]}>
          <Icon name={divisionIcon(division)} label={t.operator.divisions[division]} />
        </span>
      ))}
    </span>
  );
}

export function customerColumns(t: Dictionary, locale: Locale): Column<CustomerSummary>[] {
  const c = t.operator.customers.columns;
  return [
    {
      key: "name",
      header: c.name,
      render: (row) => (
        <span className="cockpit-break">
          <ZoneLink href={customerHref(row.customerId)}>{row.displayName}</ZoneLink>
          <span className="cockpit-sub">{row.email}</span>
        </span>
      ),
    },
    {
      key: "number",
      header: c.number,
      render: (row) => <span className="kp-mono cockpit-break">{row.customerId}</span>,
    },
    { key: "origin", header: c.origin, render: (row) => <OriginBadge origin={row.origin} t={t} /> },
    {
      key: "divisions",
      header: c.divisions,
      render: (row) => <DivisionIcons divisions={row.divisions} t={t} />,
    },
    {
      key: "contracts",
      header: c.contracts,
      render: (row) => (
        <span className="cockpit-nowrap cockpit-small">
          {fill(t.operator.customers.contractCounts, {
            active: row.contracts.active,
            pending: row.contracts.pendingTermination,
          })}
        </span>
      ),
    },
    {
      key: "since",
      header: c.since,
      render: (row) => <span className="cockpit-nowrap">{formatDate(row.createdAt, locale)}</span>,
    },
  ];
}

/** Master data of a customer as label/value pairs. */
export function CustomerFacts({
  customer,
  t,
  locale,
}: {
  customer: CustomerSummary;
  t: Dictionary;
  locale: Locale;
}) {
  const f = t.operator.customer.facts;
  const none = t.operator.none;
  const address = customer.address;
  return (
    <Facts
      className="cockpit-facts"
      items={[
        { term: f.number, description: <span className="kp-mono">{customer.customerId}</span> },
        { term: f.email, description: <a href={`mailto:${customer.email}`}>{customer.email}</a> },
        {
          term: f.address,
          description: address
            ? `${address.street} ${address.houseNumber}, ${address.postalCode} ${address.city}`
            : none,
        },
        { term: f.phone, description: customer.phone ?? none },
        {
          term: f.locale,
          description: customer.locale ? t.operator.locales[customer.locale] : none,
        },
        { term: f.origin, description: <OriginBadge origin={customer.origin} t={t} /> },
        {
          term: f.legacy,
          description:
            customer.legacyAccounts && customer.legacyAccounts.length > 0 ? (
              <span className="kp-mono">{customer.legacyAccounts.join(", ")}</span>
            ) : (
              none
            ),
        },
        { term: f.since, description: formatDate(customer.createdAt, locale) },
      ]}
    />
  );
}

export interface ReadingGroup {
  contractId: string;
  title: string;
  readings: readonly MeterReading[] | undefined;
}

/** The meter readings of each metered contract, newest first. */
export function ReadingsPanel({
  groups,
  t,
  locale,
}: {
  groups: readonly ReadingGroup[];
  t: Dictionary;
  locale: Locale;
}) {
  const texts = t.operator.customer.readings;
  if (groups.length === 0) return <p className="kp-muted cockpit-small">{texts.none}</p>;
  const columns: Column<MeterReading>[] = [
    {
      key: "date",
      header: texts.date,
      render: (row) => <span className="cockpit-nowrap">{formatDate(row.readAt, locale)}</span>,
    },
    {
      key: "value",
      header: texts.value,
      align: "end",
      render: (row) => (
        <span className="cockpit-nowrap">{formatQuantity(row.value, row.unit, locale)}</span>
      ),
    },
    { key: "source", header: texts.source, render: (row) => texts.sources[row.source] },
    {
      key: "submitted",
      header: texts.submitted,
      render: (row) => (
        <span className="cockpit-small cockpit-nowrap">
          {formatDateTime(row.submittedAt, locale)}
        </span>
      ),
    },
  ];
  return (
    <div className="kp-stack" data-testid="customer-readings">
      {groups.map((group) => (
        <section key={group.contractId} aria-label={fill(texts.caption, { contract: group.title })}>
          <h3 className="cockpit-h3">{group.title}</h3>
          {group.readings === undefined ? (
            <p className="kp-muted cockpit-small">{texts.error}</p>
          ) : (
            <DataTable
              className="cockpit-table"
              caption={
                <span className="kp-sr-only">{fill(texts.caption, { contract: group.title })}</span>
              }
              columns={columns}
              rows={group.readings}
              rowKey={(row) => row.readingId}
              empty={<p className="kp-muted cockpit-small">{texts.empty}</p>}
            />
          )}
        </section>
      ))}
    </div>
  );
}

const DOCUMENT_TONES: Record<CustomerDocument["status"], StatusTone> = {
  pending: "info",
  uploaded: "ok",
  rejected: "err",
};

/** The customer's documents (metadata only; the operator does not download files). */
export function DocumentsPanel({
  documents,
  name,
  t,
  locale,
}: {
  documents: readonly CustomerDocument[] | undefined;
  name: string;
  t: Dictionary;
  locale: Locale;
}) {
  const texts = t.operator.customer.documents;
  if (documents === undefined) return <p className="kp-muted cockpit-small">{texts.error}</p>;
  const columns: Column<CustomerDocument>[] = [
    {
      key: "name",
      header: texts.name,
      render: (row) => <span className="cockpit-break">{row.fileName}</span>,
    },
    { key: "category", header: texts.category, render: (row) => texts.categories[row.category] },
    {
      key: "size",
      header: texts.size,
      align: "end",
      render: (row) => (
        <span className="cockpit-nowrap">{formatFileSize(row.sizeBytes, locale)}</span>
      ),
    },
    {
      key: "status",
      header: texts.status,
      render: (row) => (
        <StatusBadge tone={DOCUMENT_TONES[row.status]}>{texts.statuses[row.status]}</StatusBadge>
      ),
    },
    {
      key: "date",
      header: texts.date,
      render: (row) => (
        <span className="cockpit-small cockpit-nowrap">
          {formatDateTime(row.uploadedAt ?? row.createdAt, locale)}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      data-testid="customer-documents"
      className="cockpit-table"
      caption={<span className="kp-sr-only">{fill(texts.caption, { name })}</span>}
      columns={columns}
      rows={documents}
      rowKey={(row) => row.documentId}
      empty={<p className="kp-muted cockpit-small">{texts.empty}</p>}
    />
  );
}

const KIND_TONES: Record<Notification["kind"], StatusTone> = {
  welcome: "ok",
  info: "info",
  warning: "warn",
};

/** The mailbox as the customer sees it, read only: kind, title, time, text, read state. */
export function MailboxPanel({
  notifications,
  name,
  t,
  locale,
}: {
  notifications: readonly Notification[] | undefined;
  name: string;
  t: Dictionary;
  locale: Locale;
}) {
  const texts = t.operator.customer.mailbox;
  if (notifications === undefined) return <p className="kp-muted cockpit-small">{texts.error}</p>;
  if (notifications.length === 0) return <p className="kp-muted cockpit-small">{texts.empty}</p>;
  return (
    <>
      <p className="kp-muted cockpit-small">{texts.intro}</p>
      <ul
        className="cockpit-mail"
        aria-label={fill(texts.label, { name })}
        data-testid="customer-mailbox"
      >
        {notifications.map((message) => (
          <li key={message.notificationId} data-unread={!message.read || undefined}>
            <div className="cockpit-mail-head">
              <StatusBadge tone={KIND_TONES[message.kind]}>{texts.kinds[message.kind]}</StatusBadge>
              <strong className="cockpit-mail-title">{message.title}</strong>
              <time className="kp-muted cockpit-small" dateTime={message.createdAt}>
                {formatDateTime(message.createdAt, locale)}
              </time>
              <span className="kp-muted cockpit-small">
                {message.read ? texts.read : texts.unread}
              </span>
            </div>
            <p className="cockpit-mail-body">{message.body}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
