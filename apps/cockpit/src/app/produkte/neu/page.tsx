import { ButtonLink, Card, Page } from "@kundenportal/ui";
import { requireSession } from "@kundenportal/web-auth/pages";
import { OperatorForbidden } from "@/components/operator-ui";
import { ProductForm } from "@/components/product-form";
import { dictionary } from "@/i18n";
import { accessOf } from "@/lib/tenancy";
import { dayKey } from "@/lib/time";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

/** "Produkt anlegen": a new product as draft with price version 1. */
export default async function NewProductPage() {
  const session = await requireSession(zonePath("/produkte/neu"));
  const { t } = await dictionary();
  const texts = t.products;
  if (accessOf(session) === "none")
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={texts.form.title} />;
  return (
    <Page
      eyebrow={texts.title}
      title={texts.form.title}
      lead={texts.form.lead}
      actions={
        <ButtonLink href={zonePath("/produkte")} variant="secondary" linkComponent={ZoneLink}>
          {texts.back}
        </ButtonLink>
      }
    >
      <Card as="section" aria-label={texts.form.title} className="cockpit-form-card">
        <ProductForm texts={texts} divisions={t.operator.divisions} today={dayKey(new Date())} />
      </Card>
    </Page>
  );
}
