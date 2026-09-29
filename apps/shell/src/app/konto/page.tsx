import { dictionary } from "@/i18n";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { locale, t } = await dictionary();
  const { data: customer } = await (await api()).GET("/me");
  if (!customer) {
    return (
      <section>
        <h1>{t.account.title}</h1>
        <p role="alert">{t.account.error}</p>
      </section>
    );
  }
  const since = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(customer.createdAt),
  );
  return (
    <section>
      <h1>{t.account.title}</h1>
      <dl className="facts" data-testid="account">
        <dt>{t.account.customerId}</dt>
        <dd>{customer.customerId}</dd>
        <dt>{t.account.name}</dt>
        <dd>{customer.displayName}</dd>
        <dt>{t.account.email}</dt>
        <dd>{customer.email}</dd>
        <dt>{t.account.locale}</dt>
        <dd>{customer.locale === "de" ? "Deutsch" : "English"}</dd>
        <dt>{t.account.origin}</dt>
        <dd>{t.account.origins[customer.origin]}</dd>
        <dt>{t.account.since}</dt>
        <dd>{since}</dd>
      </dl>
    </section>
  );
}
