import { Card, Notice, Page, Stack } from "@kundenportal/ui";
import { requireSession } from "@kundenportal/web-auth/pages";
import { ContractTable } from "@/components/contract-table";
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
import { forbidden, loadContracts, loadProducts } from "@/lib/admin";
import { catalogOf } from "@/lib/contracts";
import {
  CONTRACT_SORTS,
  CONTRACT_STATUSES,
  type ContractSort,
  DIVISIONS,
  type SearchParams,
  activeFilters,
  contractFilters,
  contractQuery,
} from "@/lib/filters";
import { accessOf } from "@/lib/tenancy";
import { zonePath } from "@/lib/zone";

export const dynamic = "force-dynamic";

const PATH = zonePath("/vertraege");
/** The default order stays out of the links. */
const DEFAULTS = { sort: "updated" };

/** Contracts of the instance with search, filters, order and pages (GET form, URL state). */
export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession(PATH);
  const [{ locale, t }, params] = await Promise.all([dictionary(), searchParams]);
  const texts = t.operator.contracts;
  const access = accessOf(session);
  if (access === "none")
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={texts.title} />;

  const filters = contractFilters(params);
  const [page, products] = await Promise.all([
    loadContracts(session, contractQuery(filters)),
    loadProducts(session),
  ]);
  if (forbidden(page))
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={texts.title} />;

  const catalog = products.data?.items ?? [];
  const productOptions = [...catalog]
    .filter((product) => !filters.division || product.division === filters.division)
    .sort((a, b) => a.name.localeCompare(b.name, locale))
    .map((product) => ({ value: product.productId, label: product.name }));
  // A product chosen in the URL stays selectable even if the catalogue did not load.
  if (filters.product && !productOptions.some((option) => option.value === filters.product))
    productOptions.unshift({ value: filters.product, label: filters.product });

  const data = page.data;
  return (
    <Page eyebrow={texts.eyebrow} title={texts.title} lead={texts.lead}>
      <Stack data-testid="contracts-admin" data-total={data?.total}>
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
                name: "division",
                label: texts.division,
                value: filters.division,
                options: choices(DIVISIONS, t.operator.divisions),
              },
              {
                name: "status",
                label: texts.status,
                value: filters.status,
                options: choices(CONTRACT_STATUSES, t.operator.states),
              },
              {
                name: "product",
                label: texts.product,
                value: filters.product,
                options: productOptions,
              },
              {
                name: "endsBefore",
                label: texts.endsBefore,
                value: filters.endsBefore,
                type: "date",
              },
              {
                name: "sort",
                label: texts.sort,
                value: filters.sort,
                placeholder: false,
                options: choices(Object.keys(CONTRACT_SORTS) as ContractSort[], texts.sorts),
              },
            ]}
          />
        </Card>
        <Card as="section" aria-label={texts.caption}>
          {data === undefined ? (
            <Notice tone="error">{t.operator.error}</Notice>
          ) : (
            <>
              <ContractTable
                testId="contract-table"
                wide
                rows={data.items}
                columns={[
                  "customer",
                  "contract",
                  "tariff",
                  "product",
                  "installment",
                  "start",
                  "end",
                  "status",
                ]}
                caption={texts.caption}
                empty={
                  <p className="kp-muted" data-testid="contracts-empty">
                    {activeFilters(filters) > 0 || filters.cursor ? texts.empty : texts.emptyAll}
                  </p>
                }
                t={t}
                locale={locale}
                catalog={catalogOf(catalog)}
              />
              <Pager
                path={PATH}
                filters={filters}
                nextCursor={data.nextCursor}
                total={totalText(data.total, texts.total, texts.totalOne, locale)}
                t={t}
                defaults={DEFAULTS}
              />
            </>
          )}
        </Card>
      </Stack>
    </Page>
  );
}
