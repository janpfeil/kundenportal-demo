import { Facts, Notice, Page } from "@kundenportal/ui";
import { PASS_GROUP, groupsOf } from "@kundenportal/web-auth";
import { dictionary } from "@/i18n";
import { LinkOffers } from "@/components/link-offers";
import { ProfileForm } from "@/components/profile-form";
import { api } from "@/lib/api";
import { readSession } from "@/lib/session";
import { ShellLink } from "@/lib/shell-link";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { locale, t } = await dictionary();
  const client = await api();
  const session = await readSession();
  const passHolder = session ? groupsOf(session.accessToken).includes(PASS_GROUP) : false;
  const [{ data: customer }, { data: links }] = await Promise.all([
    client.GET("/me"),
    client.GET("/me/links"),
  ]);
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
      {passHolder && (
        <p data-testid="account-pass">
          <ShellLink href="/pass">{t.account.passHint}</ShellLink>
        </p>
      )}
      <Facts
        data-testid="account"
        items={[
          { term: t.account.customerId, description: customer.customerId },
          { term: t.account.name, description: customer.displayName },
          { term: t.account.email, description: customer.email },
          { term: t.account.locale, description: customer.locale === "de" ? "Deutsch" : "English" },
          { term: t.account.origin, description: t.account.origins[customer.origin] },
          { term: t.account.since, description: since },
          ...(customer.address
            ? [
                {
                  term: t.account.address,
                  description: `${customer.address.street} ${customer.address.houseNumber}, ${customer.address.postalCode} ${customer.address.city}`,
                },
              ]
            : []),
          ...(customer.legacyAccounts?.length
            ? [{ term: t.account.legacyAccounts, description: customer.legacyAccounts.join(", ") }]
            : []),
        ]}
      />
      <LinkOffers offers={links?.links ?? []} texts={t.account.links} />
      <ProfileForm
        displayName={customer.displayName}
        locale={customer.locale}
        texts={t.account.edit}
      />
    </Page>
  );
}
