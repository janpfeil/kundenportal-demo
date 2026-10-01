import { ButtonLink, Card, Notice, Page, Stack, Tabs } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { requireSession } from "@kundenportal/web-auth/pages";
import { ContractTable } from "@/components/contract-table";
import {
  CustomerFacts,
  DivisionIcons,
  DocumentsPanel,
  MailboxPanel,
  OriginBadge,
  type ReadingGroup,
  ReadingsPanel,
} from "@/components/customers";
import { OperatorForbidden, TenantNotice } from "@/components/operator-ui";
import { dictionary } from "@/i18n";
import {
  forbidden,
  loadContracts,
  loadCustomer,
  loadDocuments,
  loadNotifications,
  loadProducts,
  loadReadings,
} from "@/lib/admin";
import { catalogOf, optionLabel } from "@/lib/contracts";
import { METERED, isCustomerId } from "@/lib/filters";
import { shortId } from "@/lib/money";
import { accessOf } from "@/lib/tenancy";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

/** Contracts of one customer the page lists (the API's page maximum). */
const CONTRACT_LIMIT = 100;

type Params = Promise<{ customerId: string }>;

/**
 * One customer as the operator sees them: master data, then tabs with contracts, meter
 * readings per metered contract, documents and the mailbox (read only).
 */
export default async function CustomerPage({ params }: { params: Params }) {
  const { customerId } = await params;
  const path = zonePath(`/kunden/${encodeURIComponent(customerId)}`);
  const session = await requireSession(path);
  const { locale, t } = await dictionary();
  const texts = t.operator.customer;
  const access = accessOf(session);
  if (access === "none")
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={t.operator.customers.title} />;

  const back = (
    <ButtonLink href={zonePath("/kunden")} variant="secondary" linkComponent={ZoneLink}>
      {texts.back}
    </ButtonLink>
  );
  const valid = isCustomerId(customerId);
  const customer = valid ? await loadCustomer(session, customerId) : { data: undefined, code: 404 };
  if (forbidden(customer))
    return <OperatorForbidden t={t} eyebrow={texts.eyebrow} title={t.operator.customers.title} />;
  if (customer.data === undefined) {
    return (
      <Page eyebrow={texts.eyebrow} title={t.operator.customers.title} actions={back}>
        <Notice tone={customer.code === 404 ? "warning" : "error"} data-testid="not-found">
          {customer.code === 404 ? texts.notFound : t.operator.error}
        </Notice>
      </Page>
    );
  }

  const person = customer.data;
  const [contracts, notifications, documents, products] = await Promise.all([
    loadContracts(session, { customerId, limit: CONTRACT_LIMIT, sort: "startDate", order: "desc" }),
    loadNotifications(session, customerId),
    loadDocuments(session, customerId),
    loadProducts(session),
  ]);
  const catalog = catalogOf(products.data?.items);
  const metered = (contracts.data?.items ?? []).filter((contract) =>
    METERED.includes(contract.division),
  );
  const readings = await Promise.all(
    metered.map((contract) => loadReadings(session, contract.contractId)),
  );
  const groups: ReadingGroup[] = metered.map((contract, index) => ({
    contractId: contract.contractId,
    title: [
      t.operator.divisions[contract.division],
      `${contract.tariffName} · ${optionLabel(catalog, contract.productId, contract.tariffOption)}`,
      contract.meterNumber ?? shortId(contract.contractId),
    ].join(" · "),
    readings: readings[index]?.data?.items,
  }));

  const contractsPanel =
    contracts.data === undefined ? (
      <p className="kp-muted cockpit-small">{t.operator.error}</p>
    ) : (
      <ContractTable
        testId="customer-contracts"
        wide
        rows={contracts.data.items}
        columns={["contract", "tariff", "product", "installment", "start", "end", "status"]}
        caption={fill(texts.contractsCaption, { name: person.displayName })}
        empty={<p className="kp-muted cockpit-small">{texts.contractsEmpty}</p>}
        t={t}
        locale={locale}
        catalog={catalog}
      />
    );

  return (
    <Page
      eyebrow={texts.eyebrow}
      title={person.displayName}
      aside={
        <span className="cockpit-row">
          <OriginBadge origin={person.origin} t={t} />
          <DivisionIcons divisions={person.divisions} t={t} />
        </span>
      }
      actions={back}
    >
      <Stack data-testid="customer-detail" data-customer={person.customerId}>
        {access === "pass" && <TenantNotice t={t} accessToken={session.accessToken} />}
        <Card as="section" aria-label={texts.eyebrow}>
          <CustomerFacts customer={person} t={t} locale={locale} />
        </Card>
        <Card as="section" aria-label={texts.tabs.label}>
          <Tabs
            label={texts.tabs.label}
            items={[
              {
                id: "vertraege",
                icon: "file",
                label: `${texts.tabs.contracts} (${contracts.data?.total ?? "–"})`,
                panel: contractsPanel,
              },
              {
                id: "zaehlerstaende",
                icon: "gauge",
                label: texts.tabs.readings,
                panel: <ReadingsPanel groups={groups} t={t} locale={locale} />,
              },
              {
                id: "dokumente",
                icon: "upload",
                label: texts.tabs.documents,
                panel: (
                  <DocumentsPanel
                    documents={documents.data?.items}
                    name={person.displayName}
                    t={t}
                    locale={locale}
                  />
                ),
              },
              {
                id: "postfach",
                icon: "mail",
                label: texts.tabs.mailbox,
                panel: (
                  <MailboxPanel
                    notifications={notifications.data?.items}
                    name={person.displayName}
                    t={t}
                    locale={locale}
                  />
                ),
              },
            ]}
          />
        </Card>
      </Stack>
    </Page>
  );
}
