import { ButtonLink, Card, DataTable, Icon, Notice, Page, Stack } from "@kundenportal/ui";
import { requireSession } from "@kundenportal/web-auth/pages";
import {
  FilterBar,
  OperatorForbidden,
  PhoneSearch,
  TenantNotice,
  choices,
  totalText,
} from "@/components/operator-ui";
import { productColumns } from "@/components/products";
import { dictionary } from "@/i18n";
import { forbidden, loadProducts } from "@/lib/admin";
import {
  DIVISIONS,
  PRODUCT_STATUSES,
  type SearchParams,
  activeFilters,
  productFilters,
} from "@/lib/filters";
import { accessOf } from "@/lib/tenancy";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

const PATH = zonePath("/produkte");

/** The product catalogue: every product of the instance by division, with status and prices. */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession(PATH);
  const [{ locale, t }, params] = await Promise.all([dictionary(), searchParams]);
  const texts = t.products;
  const access = accessOf(session);
  if (access === "none")
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={texts.title} />;

  const products = await loadProducts(session);
  if (forbidden(products))
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={texts.title} />;

  const filters = productFilters(params);
  const rows = (products.data?.items ?? [])
    .filter((product) => !filters.division || product.division === filters.division)
    .filter((product) => !filters.status || product.status === filters.status)
    .sort(
      (a, b) =>
        DIVISIONS.indexOf(a.division) - DIVISIONS.indexOf(b.division) ||
        a.name.localeCompare(b.name, locale),
    );

  return (
    <Page
      eyebrow={texts.eyebrow}
      title={texts.title}
      lead={texts.lead}
      actions={
        <ButtonLink
          href={zonePath("/produkte/neu")}
          linkComponent={ZoneLink}
          data-testid="product-create"
        >
          <Icon name="plus" />
          {texts.create}
        </ButtonLink>
      }
    >
      <Stack data-testid="products" data-total={rows.length}>
        <PhoneSearch t={t} />
        {access === "pass" && <TenantNotice t={t} accessToken={session.accessToken} />}
        <Card as="section" aria-label={t.operator.list.filters}>
          <FilterBar
            path={PATH}
            filters={filters}
            t={t}
            label={t.operator.list.filters}
            fields={[
              {
                name: "division",
                label: texts.division,
                value: filters.division,
                options: choices(DIVISIONS, t.operator.divisions),
              },
              {
                name: "status",
                label: texts.status,
                value: filters.status,
                options: choices(PRODUCT_STATUSES, texts.statuses),
              },
            ]}
          />
        </Card>
        <Card as="section" aria-label={texts.caption}>
          {products.data === undefined ? (
            <Notice tone="error">{t.operator.error}</Notice>
          ) : (
            <>
              <div className="cockpit-table-scroll">
                <DataTable
                  data-testid="product-table"
                  className="cockpit-table cockpit-wide"
                  caption={<span className="kp-sr-only">{texts.caption}</span>}
                  columns={productColumns(t, locale)}
                  rows={rows}
                  rowKey={(row) => row.productId}
                  empty={
                    <p className="kp-muted" data-testid="products-empty">
                      {activeFilters(filters) > 0 ? texts.empty : texts.emptyAll}
                    </p>
                  }
                />
              </div>
              <p className="kp-muted cockpit-small cockpit-pager" data-testid="list-total">
                {totalText(rows.length, texts.total, texts.totalOne, locale)}
              </p>
            </>
          )}
        </Card>
      </Stack>
    </Page>
  );
}
