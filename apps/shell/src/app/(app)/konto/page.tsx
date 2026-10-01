import type { Contract, DataUsage } from "@kundenportal/api-contract";
import {
  Banner,
  ButtonLink,
  Card,
  Facts,
  Grid,
  Icon,
  MessageList,
  Notice,
  Page,
  Split,
  Stack,
  StatusBadge,
  divisionIcon,
  formatDataVolume,
  formatDate,
} from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { PASS_GROUP, groupsOf } from "@kundenportal/web-auth";
import { AccountCard } from "@/components/account-card";
import { ContractCard } from "@/components/contract-card";
import { LinkOffers } from "@/components/link-offers";
import { dictionary } from "@/i18n";
import { api } from "@/lib/api";
import {
  type ConsumptionHistory,
  METERED,
  contractCard,
  dueReading,
  longDate,
  messageTime,
  monthYear,
  newestFirst,
} from "@/lib/overview";
import { readSession } from "@/lib/session";
import { ShellLink } from "@/lib/shell-link";

export const dynamic = "force-dynamic";

/** The data of one section, or undefined if its call failed: one failing API must not kill the page. */
async function settle<T>(call: Promise<{ data?: T }>): Promise<T | undefined> {
  try {
    return (await call).data;
  } catch {
    return undefined;
  }
}

/**
 * Overview and account ("Übersicht / Konto" in the mockup): greeting, reading due, contract
 * tiles, account facts, the newest messages and further legacy accounts to link.
 */
export default async function AccountPage() {
  const [{ locale, t }, client, session] = await Promise.all([dictionary(), api(), readSession()]);
  const passHolder = session ? groupsOf(session.accessToken).includes(PASS_GROUP) : false;
  const [customer, links, notifications, contractList] = await Promise.all([
    settle(client.GET("/me")),
    settle(client.GET("/me/links")),
    settle(client.GET("/notifications")),
    settle(client.GET("/contracts")),
  ]);
  const contracts: Contract[] = contractList?.items ?? [];
  const active = contracts.filter((contract) => contract.status === "active");

  // Consumption of the metered contracts and the (demo) data usage of mobile ones.
  const [histories, usages] = await Promise.all([
    Promise.all(
      active
        .filter((contract) => METERED.has(contract.division))
        .map(async (contract) => {
          const history = await settle(
            client.GET("/contracts/{contractId}/consumption", {
              params: { path: { contractId: contract.contractId } },
            }),
          );
          return [contract.contractId, history] as const;
        }),
    ),
    Promise.all(
      active
        .filter((contract) => contract.division === "mobile")
        .map(async (contract) => {
          const usage = await settle(
            client.GET("/contracts/{contractId}/usage", {
              params: { path: { contractId: contract.contractId } },
            }),
          );
          return [contract.contractId, usage] as const;
        }),
    ),
  ]);
  const historyById = new Map(
    histories.filter((entry): entry is [string, ConsumptionHistory] => entry[1] !== undefined),
  );
  const usageById = new Map(
    usages.filter((entry): entry is [string, DataUsage] => entry[1] !== undefined),
  );

  const texts = t.overview;
  const now = new Date();
  const name = customer?.displayName ?? session?.name ?? session?.email ?? "";
  const due = dueReading(contracts, historyById);
  const messages = newestFirst(notifications?.items ?? []);
  const unread = messages.filter((message) => !message.read).length;

  return (
    <Page
      eyebrow={longDate(now, locale)}
      title={fill(texts.greeting, { name })}
      aside={
        <ButtonLink href="/verbrauch" variant="secondary">
          <Icon name="chart" />
          {texts.consumption}
        </ButtonLink>
      }
    >
      <Stack gap="large">
        {due && (
          <Banner
            icon={divisionIcon(due.division)}
            title={fill(texts.due.title, { division: t.divisions[due.division] })}
            action={<ButtonLink href="/verbrauch">{texts.due.action}</ButtonLink>}
          >
            {fill(texts.due.text, { date: formatDate(due.nextReadingDue, locale) })}
          </Banner>
        )}

        {passHolder && (
          <p data-testid="account-pass" className="account-pass">
            <Icon name="ticket" />
            <ShellLink href="/pass">{t.account.passHint}</ShellLink>
          </p>
        )}

        <section aria-labelledby="overview-contracts">
          <div className="section-head">
            <h2 id="overview-contracts">{texts.contracts.heading}</h2>
            <a href="/vertraege">{texts.contracts.all}</a>
          </div>
          {!contractList ? (
            <Notice tone="error">{texts.contracts.error}</Notice>
          ) : contracts.length === 0 ? (
            <p className="kp-muted">{texts.contracts.empty}</p>
          ) : (
            <Grid min="230px">
              {contracts.map((contract) => (
                <ContractCard
                  key={contract.contractId}
                  card={contractCard(
                    contract,
                    customer,
                    texts.contracts,
                    historyById.get(contract.contractId),
                    usageById.get(contract.contractId),
                    (megabytes) => formatDataVolume(megabytes, locale),
                  )}
                  texts={texts.contracts}
                  locale={locale}
                />
              ))}
            </Grid>
          )}
        </section>

        <Split>
          {customer ? (
            <AccountCard
              title={t.account.title}
              profile={{ displayName: customer.displayName, locale: customer.locale }}
              texts={t.account.edit}
            >
              <Facts
                data-testid="account"
                items={[
                  {
                    term: t.account.customerId,
                    description: <span className="kp-mono">{customer.customerId}</span>,
                    id: "customerId",
                  },
                  { term: t.account.name, description: customer.displayName },
                  { term: t.account.email, description: customer.email },
                  ...(customer.address
                    ? [
                        {
                          term: t.account.address,
                          description: `${customer.address.street} ${customer.address.houseNumber}, ${customer.address.postalCode} ${customer.address.city}`,
                        },
                      ]
                    : []),
                  {
                    term: t.account.locale,
                    description: customer.locale === "de" ? "Deutsch" : "English",
                  },
                  {
                    term: t.account.origin,
                    description:
                      customer.origin === "registration" ? (
                        t.account.origins.registration
                      ) : (
                        <>
                          {t.account.origins[customer.origin]}{" "}
                          <span className="shell-tag">{t.account.takenOver}</span>
                        </>
                      ),
                    id: "origin",
                  },
                  { term: t.account.since, description: monthYear(customer.createdAt, locale) },
                  ...(customer.legacyAccounts?.length
                    ? [
                        {
                          term: t.account.legacyAccounts,
                          description: (
                            <span className="kp-mono">{customer.legacyAccounts.join(", ")}</span>
                          ),
                          id: "legacyAccounts",
                        },
                      ]
                    : []),
                ]}
              />
            </AccountCard>
          ) : (
            <Card as="section" title={t.account.title}>
              <Notice tone="error">{t.account.error}</Notice>
            </Card>
          )}

          <Card
            as="section"
            title={texts.mailbox.heading}
            actions={
              unread > 0 ? (
                <StatusBadge tone="info">
                  {fill(texts.mailbox.unread, { count: unread })}
                </StatusBadge>
              ) : undefined
            }
          >
            {!notifications ? (
              <p className="kp-muted">{texts.mailbox.error}</p>
            ) : messages.length === 0 ? (
              <p className="kp-muted">{texts.mailbox.empty}</p>
            ) : (
              <MessageList
                locale={locale}
                linkComponent={ShellLink}
                items={messages.slice(0, 3).map((message) => ({
                  id: message.notificationId,
                  href: `/postfach?n=${encodeURIComponent(message.notificationId)}`,
                  title: message.title,
                  time: messageTime(message.createdAt, now, locale, t.mailbox.yesterday),
                  preview: message.body,
                  unread: !message.read,
                }))}
              />
            )}
          </Card>
        </Split>

        <LinkOffers offers={links?.links ?? []} texts={t.account.links} />
      </Stack>
    </Page>
  );
}
