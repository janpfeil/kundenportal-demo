/*
 * The product catalogue's views: status badge, the prices of an option in words, the list's
 * columns, the facts of a product and its price versions. Server components.
 */

import {
  type Column,
  DataTable,
  Facts,
  StatusBadge,
  formatDataVolume,
  formatDate,
  formatDateTime,
  formatEuro,
  formatNumber,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { Dictionary } from "@/i18n";
import type { ProductStatus } from "@/lib/filters";
import { formatWorkPrice } from "@/lib/money";
import {
  PRODUCT_TONES,
  type PriceVersion,
  type Product,
  type ProductOption,
  contractsOn,
  optionFields,
  runningContracts,
} from "@/lib/products";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";
import { DivisionLabel } from "./operator-ui";

export const productHref = (productId: string) =>
  zonePath(`/produkte/${encodeURIComponent(productId)}`);

export function ProductStatusBadge({ status, t }: { status: ProductStatus; t: Dictionary }) {
  return (
    <StatusBadge tone={PRODUCT_TONES[status]} data-status={status}>
      {t.products.statuses[status]}
    </StatusBadge>
  );
}

/** "12,00 € Grundpreis/Monat · 32 ct/kWh", "19,99 €/Monat · 20 GB", "44,99 €/Monat · 250 Mbit/s". */
export function optionPrices(
  option: ProductOption,
  product: Pick<Product, "division" | "unit">,
  t: Dictionary,
  locale: Locale,
): string {
  const p = t.products.price;
  const fields = optionFields(product.division);
  const monthly = formatEuro(option.monthlyPriceCent, locale);
  const parts = [fill(fields.work ? p.base : p.monthly, { price: monthly })];
  if (option.workPriceCent !== undefined)
    parts.push(formatWorkPrice(option.workPriceCent, product.unit ?? "kWh", locale));
  if (option.dataVolumeMb !== undefined) parts.push(formatDataVolume(option.dataVolumeMb, locale));
  if (option.bandwidthMbit !== undefined)
    parts.push(fill(p.bandwidth, { mbit: formatNumber(option.bandwidthMbit, locale) }));
  return parts.join(" · ");
}

/** The options of a version, one per line: "Öko: 12,00 € Grundpreis/Monat · 34 ct/kWh". */
export function OptionList({
  options,
  product,
  t,
  locale,
}: {
  options: readonly ProductOption[];
  product: Pick<Product, "division" | "unit">;
  t: Dictionary;
  locale: Locale;
}) {
  return (
    <ul className="cockpit-options">
      {options.map((option) => (
        <li key={option.optionId}>
          <strong>{option.label}</strong>{" "}
          <span className="cockpit-small">{optionPrices(option, product, t, locale)}</span>
        </li>
      ))}
    </ul>
  );
}

export function productColumns(t: Dictionary, locale: Locale): Column<Product>[] {
  const c = t.products.columns;
  return [
    {
      key: "product",
      header: c.product,
      render: (row) => (
        <span className="cockpit-break">
          <ZoneLink href={productHref(row.productId)}>{row.name}</ZoneLink>
          <span className="cockpit-sub kp-mono">{row.productId}</span>
        </span>
      ),
    },
    {
      key: "division",
      header: c.division,
      render: (row) => <DivisionLabel division={row.division} t={t} />,
    },
    {
      key: "status",
      header: c.status,
      render: (row) => <ProductStatusBadge status={row.status} t={t} />,
    },
    {
      key: "options",
      header: c.options,
      render: (row) => <OptionList options={row.options} product={row} t={t} locale={locale} />,
    },
    {
      key: "version",
      header: c.version,
      render: (row) => fill(t.products.versionShort, { version: row.version }),
    },
    {
      key: "contracts",
      header: c.contracts,
      align: "end",
      render: (row) => formatNumber(runningContracts(row), locale),
    },
  ];
}

export function ProductFacts({
  product,
  t,
  locale,
}: {
  product: Product;
  t: Dictionary;
  locale: Locale;
}) {
  const f = t.products.facts;
  const months = (count: number) => (count === 0 ? f.noTerm : fill(f.months, { count }));
  const current = product.versions?.find((version) => version.version === product.version);
  return (
    <Facts
      className="cockpit-facts"
      items={[
        { term: f.id, description: <span className="kp-mono">{product.productId}</span> },
        { term: f.division, description: <DivisionLabel division={product.division} t={t} /> },
        { term: f.status, description: <ProductStatusBadge status={product.status} t={t} /> },
        { term: f.description, description: product.description || t.operator.none },
        { term: f.term, description: months(product.minimumTermMonths) },
        { term: f.notice, description: months(product.noticePeriodMonths) },
        {
          term: f.version,
          description: current
            ? fill(f.versionValue, {
                version: product.version,
                date: formatDate(current.validFrom, locale),
              })
            : String(product.version),
        },
        { term: f.contracts, description: formatNumber(runningContracts(product), locale) },
        { term: f.updated, description: formatDateTime(product.updatedAt, locale) },
      ]}
    />
  );
}

/** Every price version, newest first, with its prices and the contracts running on it. */
export function VersionsTable({
  product,
  t,
  locale,
}: {
  product: Product;
  t: Dictionary;
  locale: Locale;
}) {
  const texts = t.products.versions;
  const versions: PriceVersion[] = product.versions ?? [
    {
      version: product.version,
      validFrom: "",
      createdAt: product.updatedAt,
      options: product.options,
    },
  ];
  const columns: Column<PriceVersion>[] = [
    {
      key: "version",
      header: texts.version,
      render: (row) => (
        <span className="cockpit-nowrap">
          {fill(t.products.versionShort, { version: row.version })}
          {row.version === product.version && (
            <>
              {" "}
              <StatusBadge tone="ok">{texts.current}</StatusBadge>
            </>
          )}
        </span>
      ),
    },
    {
      key: "validFrom",
      header: texts.validFrom,
      render: (row) => (row.validFrom ? formatDate(row.validFrom, locale) : t.operator.none),
    },
    {
      key: "prices",
      header: texts.prices,
      render: (row) => <OptionList options={row.options} product={product} t={t} locale={locale} />,
    },
    {
      key: "contracts",
      header: texts.contracts,
      align: "end",
      render: (row) => formatNumber(contractsOn(product, row.version), locale),
    },
  ];
  return (
    <DataTable
      data-testid="price-versions"
      className="cockpit-table"
      caption={<span className="kp-sr-only">{texts.caption}</span>}
      columns={columns}
      rows={[...versions].sort((a, b) => b.version - a.version)}
      rowKey={(row) => String(row.version)}
      empty={<p className="kp-muted cockpit-small">{texts.empty}</p>}
    />
  );
}
