import { Facts, Notice, Page } from "@kundenportal/ui";
import { dictionary } from "@/i18n";
import { ProfileForm } from "@/components/profile-form";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { locale, t } = await dictionary();
  const { data: customer } = await (await api()).GET("/me");
  if (!customer) {
    return (
      <Page title={t.account.title}>
        <Notice tone="error">{t.account.error}</Notice>
      </Page>
    );
  }
  const since = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(customer.createdAt),
  );
  return (
    <Page title={t.account.title}>
      <Facts
        data-testid="account"
        items={[
          { term: t.account.customerId, description: customer.customerId },
          { term: t.account.name, description: customer.displayName },
          { term: t.account.email, description: customer.email },
          { term: t.account.locale, description: customer.locale === "de" ? "Deutsch" : "English" },
          { term: t.account.origin, description: t.account.origins[customer.origin] },
          { term: t.account.since, description: since },
        ]}
      />
      <ProfileForm
        displayName={customer.displayName}
        locale={customer.locale}
        texts={t.account.edit}
      />
    </Page>
  );
}
