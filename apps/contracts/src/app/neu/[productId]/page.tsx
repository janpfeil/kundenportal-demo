import { ButtonLink, Notice, Page } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { loginUrl } from "@kundenportal/web-auth";
import { typedApi } from "@/lib/api";
import { requireSession } from "@kundenportal/web-auth/pages";
import { OrderForm } from "@/components/order-form";
import { dictionary } from "@/i18n";
import { dayKey } from "@/lib/dates";
import { PRODUCT_ID, type Product, pickOption } from "@/lib/products";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

/** Phase 7: ordering an option of a product (`?option=` preselects it). */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ productId }, query] = await Promise.all([params, searchParams]);
  const path = zonePath(`/neu/${encodeURIComponent(productId)}`);
  const session = await requireSession(path);
  const { locale, t } = await dictionary();
  const back = (
    <ButtonLink href={zonePath("/neu")} variant="secondary" linkComponent={ZoneLink}>
      {t.order.back}
    </ButtonLink>
  );

  let product: Product | undefined;
  let failed = false;
  if (PRODUCT_ID.test(productId)) {
    try {
      const result = await typedApi(session).GET("/products");
      product = result.data?.items.find(
        (item) => item.productId === productId && item.status === "active",
      );
      failed = !result.data;
    } catch {
      failed = true;
    }
  }
  const option = product && pickOption(product, query.option);
  if (!product || !option) {
    return (
      <Page eyebrow={t.catalogue.title} title={t.catalogue.title} aside={back}>
        <Notice tone="error">{failed ? t.order.error : t.order.notFound}</Notice>
      </Page>
    );
  }

  return (
    <Page
      eyebrow={t.catalogue.title}
      title={fill(t.order.title, { product: product.name })}
      lead={product.description || undefined}
      aside={back}
    >
      <OrderForm
        product={product}
        initialOption={option.optionId}
        today={dayKey()}
        locale={locale}
        t={t}
        loginHref={loginUrl(path)}
      />
    </Page>
  );
}
