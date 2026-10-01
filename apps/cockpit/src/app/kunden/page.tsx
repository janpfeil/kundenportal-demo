import { Card, DataTable, Notice, Page, Stack } from "@kundenportal/ui";
import { requireSession } from "@kundenportal/web-auth/pages";
import { customerColumns } from "@/components/customers";
import {
  FilterBar,
  OperatorForbidden,
  Pager,
  PhoneSearch,
  TenantNotice,
  choices,
  totalText,
} from "@/components/operator-ui";
import { dictionary } from "@/i18n";
import { forbidden, loadCustomers } from "@/lib/admin";
import {
  CUSTOMER_CONTRACTS,
  CUSTOMER_SORTS,
  type CustomerSort,
  DIVISIONS,
  ORIGINS,
  type SearchParams,
  activeFilters,
  customerFilters,
  customerQuery,
} from "@/lib/filters";
import { accessOf } from "@/lib/tenancy";
import { zonePath } from "@/lib/zone";

export const dynamic = "force-dynamic";

const PATH = zonePath("/kunden");

/** Customers of the instance with search, filters, order and pages (GET form, URL state). */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession(PATH);
  const [{ locale, t }, params] = await Promise.all([dictionary(), searchParams]);
  const texts = t.operator.customers;
  const access = accessOf(session);
  if (access === "none")
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={texts.title} />;

  const filters = customerFilters(params);
  const page = await loadCustomers(session, customerQuery(filters));
  if (forbidden(page))
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={texts.title} />;

  const data = page.data;
  return (
    <Page eyebrow={texts.eyebrow} title={texts.title} lead={texts.lead}>
      <Stack data-testid="customers" data-total={data?.total}>
        <PhoneSearch t={t} />
        {access === "pass" && <TenantNotice t={t} accessToken={session.accessToken} />}
        <Card as="section" aria-label={t.operator.list.filters}>
          <FilterBar
            path={PATH}
            filters={filters}
            t={t}
            label={t.operator.list.filters}
            fields={[
              { name: "q", label: texts.search, hint: texts.searchHint, value: filters.q },
              {
                name: "origin",
                label: texts.origin,
                value: filters.origin,
                options: choices(ORIGINS, t.operator.origins),
              },
              {
                name: "division",
                label: texts.division,
                value: filters.division,
                options: choices(DIVISIONS, t.operator.divisions),
              },
              {
                name: "contracts",
                label: texts.contracts,
                value: filters.contracts,
                options: choices(CUSTOMER_CONTRACTS, texts.contractStates),
              },
              {
                name: "sort",
                label: texts.sort,
                value: filters.sort,
                placeholder: false,
                options: choices(Object.keys(CUSTOMER_SORTS) as CustomerSort[], texts.sorts),
              },
            ]}
          />
        </Card>
        <Card as="section" aria-label={texts.caption}>
          {data === undefined ? (
            <Notice tone="error">{t.operator.error}</Notice>
          ) : (
            <>
              <div className="cockpit-table-scroll">
                <DataTable
                  data-testid="customer-table"
                  className="cockpit-table cockpit-wide"
                  caption={<span className="kp-sr-only">{texts.caption}</span>}
                  columns={customerColumns(t, locale)}
                  rows={data.items}
                  rowKey={(row) => row.customerId}
                  empty={
                    <p className="kp-muted" data-testid="customers-empty">
                      {activeFilters(filters) > 0 || filters.cursor ? texts.empty : texts.emptyAll}
                    </p>
                  }
                />
              </div>
              <Pager
                path={PATH}
                filters={filters}
                nextCursor={data.nextCursor}
                total={totalText(data.total, texts.total, texts.totalOne, locale)}
                t={t}
              />
            </>
          )}
        </Card>
      </Stack>
    </Page>
  );
}
