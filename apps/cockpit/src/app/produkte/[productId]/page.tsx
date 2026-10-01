import { ButtonLink, Card, CockpitGrid, Notice, Page, Stack } from "@kundenportal/ui";
import { requireSession } from "@kundenportal/web-auth/pages";
import { DivisionLabel, OperatorForbidden, TenantNotice } from "@/components/operator-ui";
import { PriceVersionForm } from "@/components/price-version-form";
import { ProductEditForm, ProductStatusMoves } from "@/components/product-manage";
import { ProductFacts, ProductStatusBadge, VersionsTable } from "@/components/products";
import { dictionary } from "@/i18n";
import { forbidden, loadProduct } from "@/lib/admin";
import { isProductId, statusMoves } from "@/lib/products";
import { accessOf } from "@/lib/tenancy";
import { dayKey } from "@/lib/time";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

type Params = Promise<{ productId: string }>;

/**
 * One product: facts, status moves, texts and terms, price versions with their contracts
 * and the form for a new price version. Archived products are read only.
 */
export default async function ProductPage({ params }: { params: Params }) {
  const { productId } = await params;
  const session = await requireSession(zonePath(`/produkte/${encodeURIComponent(productId)}`));
  const { locale, t } = await dictionary();
  const texts = t.products;
  const access = accessOf(session);
  if (access === "none")
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={texts.title} />;

  const back = (
    <ButtonLink href={zonePath("/produkte")} variant="secondary" linkComponent={ZoneLink}>
      {texts.back}
    </ButtonLink>
  );
  const result = isProductId(productId)
    ? await loadProduct(session, productId)
    : { data: undefined, code: 404 };
  if (forbidden(result))
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={texts.title} />;
  if (result.data === undefined) {
    return (
      <Page eyebrow={texts.eyebrow} title={texts.title} actions={back}>
        <Notice tone={result.code === 404 ? "warning" : "error"} data-testid="not-found">
          {result.code === 404 ? texts.notFound : t.operator.error}
        </Notice>
      </Page>
    );
  }

  const product = result.data;
  const archived = product.status === "archived";
  return (
    <Page
      eyebrow={texts.title}
      title={product.name}
      aside={
        <span className="cockpit-row">
          <DivisionLabel division={product.division} t={t} />
          <ProductStatusBadge status={product.status} t={t} />
        </span>
      }
      actions={back}
    >
      <Stack
        data-testid="product-detail"
        data-product={product.productId}
        data-status={product.status}
      >
        {access === "pass" && <TenantNotice t={t} accessToken={session.accessToken} />}
        <CockpitGrid>
          <Stack>
            <Card as="section" title={texts.facts.title}>
              <ProductFacts product={product} t={t} locale={locale} />
            </Card>
            <Card as="section" title={texts.versions.title} icon="chart">
              <VersionsTable product={product} t={t} locale={locale} />
            </Card>
          </Stack>
          <Stack>
            <Card as="section" title={texts.moves.title}>
              <p className="kp-muted cockpit-small">{texts.moves.intro}</p>
              <ProductStatusMoves
                productId={product.productId}
                moves={statusMoves(product)}
                texts={texts}
              />
            </Card>
            {!archived && (
              <Card as="section" title={texts.priceForm.title} icon="plus">
                <PriceVersionForm
                  product={{
                    productId: product.productId,
                    division: product.division,
                    options: product.options,
                  }}
                  texts={texts}
                  today={dayKey(new Date())}
                  locale={locale}
                />
              </Card>
            )}
            {!archived && (
              <Card as="section" title={texts.edit.title} icon="settings">
                <ProductEditForm
                  product={{
                    productId: product.productId,
                    name: product.name,
                    description: product.description,
                    minimumTermMonths: product.minimumTermMonths,
                    noticePeriodMonths: product.noticePeriodMonths,
                  }}
                  texts={texts}
                />
              </Card>
            )}
          </Stack>
        </CockpitGrid>
      </Stack>
    </Page>
  );
}
