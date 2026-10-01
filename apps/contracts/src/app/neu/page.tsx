import { ButtonLink, Card, EmptyState, Notice, Page } from "@kundenportal/ui";
import { typedApi } from "@/lib/api";
import { requireSession } from "@kundenportal/web-auth/pages";
import { ProductCatalogue } from "@/components/product-catalogue";
import { dictionary } from "@/i18n";
import { groupByDivision } from "@/lib/products";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

/** Phase 7: the orderable products by division; "Auswählen" leads to the order of an option. */
export default async function CataloguePage() {
  const session = await requireSession(zonePath("/neu"));
  const { locale, t } = await dictionary();
  const result = await typedApi(session)
    .GET("/products")
    .catch(() => ({ data: undefined }));
  const products = result.data?.items;

  return (
    <Page
      eyebrow={t.title}
      title={t.catalogue.title}
      lead={t.catalogue.lead}
      aside={
        <ButtonLink href={zonePath()} variant="secondary" linkComponent={ZoneLink}>
          {t.catalogue.back}
        </ButtonLink>
      }
    >
      {!products ? (
        <Notice tone="error">{t.catalogue.error}</Notice>
      ) : groupByDivision(products).length === 0 ? (
        <Card>
          <EmptyState title={t.catalogue.empty}>{t.catalogue.emptyText}</EmptyState>
        </Card>
      ) : (
        <ProductCatalogue products={products} locale={locale} t={t} />
      )}
    </Page>
  );
}
