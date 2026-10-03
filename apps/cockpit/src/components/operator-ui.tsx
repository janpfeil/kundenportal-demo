/*
 * Small pieces the operator's pages share: the "no access" page, the search on phones, the
 * tenant notice of pass holders, a division with its icon, the GET filter bar and the pager
 * of the cursor lists. Server components; the filter bar is a plain form (works without JS).
 */

import type { Division } from "@kundenportal/api-contract";
import {
  Button,
  ButtonLink,
  Icon,
  Notice,
  Page,
  SearchField,
  Select,
  type SelectOption,
  TextField,
  divisionIcon,
  formatNumber,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import { tenantOf } from "@kundenportal/web-auth";
import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n";
import { activeFilters, listHref } from "@/lib/filters";
import { SEARCH_PATH } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

/** The page for visitors the API (or the groups in the token) do not accept as operator. */
export function OperatorForbidden({
  t,
  title,
  eyebrow,
}: {
  t: Dictionary;
  title: string;
  eyebrow: string;
}) {
  return (
    <Page eyebrow={eyebrow} title={title}>
      <Notice tone="warning" data-testid="cockpit-forbidden">
        {t.operator.forbidden}
      </Notice>
    </Page>
  );
}

/** Phones have no search in the top bar; it sits on the page instead. */
export function PhoneSearch({ t }: { t: Dictionary }) {
  return (
    <div className="cockpit-phone-search">
      <SearchField
        action={SEARCH_PATH}
        label={t.frame.search}
        placeholder={t.frame.searchPlaceholder}
        kbd={false}
      />
    </div>
  );
}

/** Pass holders see their own instance; the notice names it. */
export function TenantNotice({ t, accessToken }: { t: Dictionary; accessToken: string }) {
  const tenant = tenantOf(accessToken);
  return (
    <Notice tone="info" data-testid="cockpit-tenant" data-tenant={tenant}>
      {fill(t.access.ownInstance, { tenant: tenant ?? "" })}
    </Notice>
  );
}

/** A division as icon and name, e.g. ⚡ Strom. */
export function DivisionLabel({ division, t }: { division: Division; t: Dictionary }) {
  return (
    <span className="cockpit-division">
      <Icon name={divisionIcon(division)} />
      {t.operator.divisions[division]}
    </span>
  );
}

/** A card heading with the number of entries as a small tag, e.g. "Verträge 12". */
export function counted(title: string, count: number): ReactNode {
  return (
    <>
      {title} <span className="cockpit-tag">{count}</span>
    </>
  );
}

/** Choices of a select: an empty "Alle" first, then the values with their labels. */
export function choices<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): SelectOption[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

export interface FilterField {
  name: string;
  label: string;
  value: string | undefined;
  /** A select with these options; else a text field. */
  options?: readonly SelectOption[] | undefined;
  /** The select's first entry without a value (default "Alle"). */
  placeholder?: string | false | undefined;
  type?: "search" | "date" | undefined;
  hint?: string | undefined;
}

/**
 * The filter bar of a list: a GET form to the list itself, so the URL keeps the filters and
 * the page loads with them, with or without JavaScript. A new filter starts at page one.
 */
export function FilterBar({
  path,
  fields,
  filters,
  t,
  label,
}: {
  path: string;
  fields: readonly FilterField[];
  filters: object;
  t: Dictionary;
  label: string;
}) {
  const count = activeFilters(filters);
  return (
    <form method="get" action={path} className="cockpit-filters" role="search" aria-label={label}>
      {fields.map((field) =>
        field.options ? (
          <Select
            key={field.name}
            name={field.name}
            label={field.label}
            options={field.options}
            defaultValue={field.value ?? ""}
            {...(field.placeholder === false
              ? {}
              : { placeholder: field.placeholder ?? t.operator.list.all })}
          />
        ) : (
          <TextField
            key={field.name}
            name={field.name}
            type={field.type ?? "search"}
            label={field.label}
            hint={field.hint}
            defaultValue={field.value ?? ""}
            maxLength={60}
            autoComplete="off"
          />
        ),
      )}
      <div className="cockpit-filter-buttons">
        <Button type="submit" size="small">
          {t.operator.list.apply}
        </Button>
        {count > 0 && (
          <ZoneLink href={path} className="cockpit-small">
            {t.operator.list.reset}
          </ZoneLink>
        )}
      </div>
    </form>
  );
}

/**
 * Below a cursor list: how many rows match, "Weitere laden" with the next cursor and the way
 * back to the first page once paged.
 */
export function Pager({
  path,
  filters,
  nextCursor,
  total,
  t,
  defaults,
}: {
  path: string;
  filters: object & { cursor?: string | undefined };
  nextCursor: string | undefined;
  total: string;
  t: Dictionary;
  defaults?: Record<string, string> | undefined;
}) {
  return (
    <nav className="cockpit-pager" aria-label={t.operator.list.pages}>
      <span className="kp-muted cockpit-small" data-testid="list-total">
        {total}
      </span>
      <span className="cockpit-row">
        {filters.cursor && (
          <ZoneLink className="cockpit-small" href={listHref(path, filters, undefined, defaults)}>
            {t.operator.list.first}
          </ZoneLink>
        )}
        {nextCursor && (
          <ButtonLink
            variant="secondary"
            size="small"
            href={listHref(path, filters, nextCursor, defaults)}
            linkComponent={ZoneLink}
            data-testid="list-next"
          >
            {t.operator.list.next}
            <Icon name="right" />
          </ButtonLink>
        )}
      </span>
    </nav>
  );
}

/** "1.204 Kunden" / "1 Kunde". */
export function totalText(count: number, many: string, one: string, locale: Locale): string {
  return count === 1 ? one : fill(many, { count: formatNumber(count, locale) });
}
