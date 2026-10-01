import {
  ButtonLink,
  Card,
  CockpitGrid,
  Notice,
  Page,
  Stack,
  formatDate,
  formatEuro,
} from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { requireSession } from "@kundenportal/web-auth/pages";
import { ContractActions } from "@/components/contract-actions";
import { ContractFacts, ContractHistory, ContractStatus } from "@/components/contract-detail";
import { customerHref } from "@/components/contract-table";
import { DivisionLabel, OperatorForbidden, TenantNotice } from "@/components/operator-ui";
import { dictionary } from "@/i18n";
import { forbidden, loadContract, loadProducts } from "@/lib/admin";
import {
  availableActions,
  catalogOf,
  newerVersion,
  optionLabel,
  otherOptions,
  otherProducts,
} from "@/lib/contracts";
import { isContractId } from "@/lib/filters";
import { shortId } from "@/lib/money";
import { accessOf } from "@/lib/tenancy";
import { dayKey } from "@/lib/time";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

type Params = Promise<{ contractId: string }>;

/**
 * One contract: facts and state, the operator's actions (each with a reason) and the
 * history. After an action the page reloads, so state, facts and history show the change.
 */
export default async function ContractPage({ params }: { params: Params }) {
  const { contractId } = await params;
  const session = await requireSession(zonePath(`/vertraege/${encodeURIComponent(contractId)}`));
  const { locale, t } = await dictionary();
  const texts = t.operator.contract;
  const listTitle = t.operator.contracts.title;
  const access = accessOf(session);
  if (access === "none")
    return <OperatorForbidden t={t} eyebrow={t.operator.contracts.eyebrow} title={listTitle} />;

  const back = (
    <ButtonLink href={zonePath("/vertraege")} variant="secondary" linkComponent={ZoneLink}>
      {texts.back}
    </ButtonLink>
  );
  const [detail, products] = await Promise.all([
    isContractId(contractId)
      ? loadContract(session, contractId)
      : Promise.resolve({ data: undefined, code: 404 }),
    loadProducts(session),
  ]);
  if (forbidden(detail))
    return <OperatorForbidden t={t} eyebrow={t.operator.contracts.eyebrow} title={listTitle} />;
  if (detail.data === undefined) {
    return (
      <Page eyebrow={t.operator.contracts.eyebrow} title={listTitle} actions={back}>
        <Notice tone={detail.code === 404 ? "warning" : "error"} data-testid="not-found">
          {detail.code === 404 ? texts.notFound : t.operator.error}
        </Notice>
      </Page>
    );
  }

  const { contract, history } = detail.data;
  const catalog = products.data?.items ?? [];
  const product = catalog.find((entry) => entry.productId === contract.productId);
  const names = catalogOf(catalog);
  const actions = availableActions(contract, product, catalog);
  const today = dayKey(new Date());

  return (
    <Page
      eyebrow={fill(texts.eyebrow, { id: shortId(contract.contractId) })}
      title={`${contract.tariffName} · ${optionLabel(names, contract.productId, contract.tariffOption)}`}
      aside={<DivisionLabel division={contract.division} t={t} />}
      actions={
        <>
          {back}
          <ButtonLink
            href={customerHref(contract.customerId)}
            variant="secondary"
            linkComponent={ZoneLink}
          >
            {texts.toCustomer}
          </ButtonLink>
        </>
      }
    >
      <Stack data-testid="contract-admin" data-contract={contract.contractId}>
        {access === "pass" && <TenantNotice t={t} accessToken={session.accessToken} />}
        <CockpitGrid>
          <Stack>
            <Card as="section" title={texts.status} headingLevel={2}>
              <ContractStatus contract={contract} t={t} locale={locale} />
              {newerVersion(contract, product) && product && (
                <p className="kp-muted cockpit-small">
                  {fill(texts.newerVersion, { version: product.version })}
                </p>
              )}
            </Card>
            <Card as="section" title={texts.facts.title}>
              <ContractFacts contract={contract} t={t} locale={locale} catalog={names} />
            </Card>
          </Stack>
          <Stack>
            <Card as="section" title={t.operator.actions.title} icon="settings">
              <p className="kp-muted cockpit-small">{t.operator.actions.intro}</p>
              <ContractActions
                contractId={contract.contractId}
                actions={actions}
                options={otherOptions(contract, product).map((id) => ({
                  value: id,
                  label: optionLabel(names, contract.productId, id),
                }))}
                products={otherProducts(contract, catalog).map((entry) => ({
                  productId: entry.productId,
                  name: entry.name,
                  options: entry.options.map((option) => ({
                    value: option.optionId,
                    label: option.label,
                  })),
                }))}
                versions={
                  newerVersion(contract, product) && product && contract.productVersion
                    ? { from: contract.productVersion, to: product.version }
                    : undefined
                }
                installment={formatEuro(contract.monthlyInstallmentCent, locale)}
                earliestTermination={contract.earliestTerminationDate}
                pendingTermination={
                  contract.termination
                    ? formatDate(contract.termination.effectiveDate, locale)
                    : undefined
                }
                today={today}
                texts={t.operator.actions}
                locale={locale}
              />
            </Card>
            <Card as="section" title={t.operator.history.title} icon="clock">
              <ContractHistory history={history} t={t} locale={locale} />
            </Card>
          </Stack>
        </CockpitGrid>
      </Stack>
    </Page>
  );
}
