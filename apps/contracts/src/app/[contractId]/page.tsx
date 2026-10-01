import type { Contract } from "@kundenportal/api-contract";
import {
  Banner,
  ButtonLink,
  Card,
  Facts,
  Grid,
  Icon,
  Notice,
  Page,
  Split,
  Stack,
  divisionIcon,
} from "@kundenportal/ui";
import { loginUrl } from "@kundenportal/web-auth";
import { typedApi } from "@/lib/api";
import { requireSession } from "@kundenportal/web-auth/pages";
import { notFound } from "next/navigation";
import { ContractForm } from "@/components/contract-form";
import { ContractStatus } from "@/components/contract-status";
import { TerminationCard } from "@/components/termination-card";
import { WithdrawalCard } from "@/components/withdrawal-card";
import { dictionary } from "@/i18n";
import { isContractId } from "@/lib/contract-update";
import { dayKey } from "@/lib/dates";
import { contractFacts } from "@/lib/facts";
import { canWithdraw, contractState } from "@/lib/lifecycle";
import { type Product, optionInfo } from "@/lib/products";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

export default async function ContractPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const { contractId } = await params;
  const path = zonePath(`/${contractId}`);
  const session = await requireSession(path);
  if (!isContractId(contractId)) notFound();
  const { locale, t } = await dictionary();
  const back = (
    <ButtonLink href={zonePath()} variant="secondary" linkComponent={ZoneLink}>
      {t.detail.back}
    </ButtonLink>
  );

  const api = typedApi(session);
  let contract: Contract | undefined;
  let missing = false;
  try {
    const result = await api.GET("/contracts/{contractId}", {
      params: { path: { contractId } },
    });
    contract = result.data;
    missing = result.response.status === 404;
  } catch {
    // Shown as a loading error below.
  }
  if (!contract) {
    return (
      <Page title={t.title} aside={back}>
        <Notice tone="error">{missing ? t.detail.notFound : t.detail.error}</Notice>
      </Page>
    );
  }

  // Names and prices of the options come from the contract's product, while the catalogue
  // lists it; without it the form falls back to the known option names.
  let product: Product | undefined;
  if (contract.productId !== undefined) {
    const { division, productId } = contract;
    product = await api
      .GET("/products", { params: { query: { division } } })
      .then((result) => result.data?.items.find((item) => item.productId === productId))
      .catch(() => undefined);
  }

  const today = dayKey();
  const state = contractState(contract);
  const running = contract.status === "active";
  const changeable =
    running &&
    !contract.blocked &&
    (contract.installmentAdjustable || contract.tariffOptions.length > 1);
  // The card stays during the period after a withdrawal, to confirm it in place.
  const withdrawal =
    canWithdraw(contract, today) ||
    (state.kind === "withdrawn" && (contract.withdrawableUntil ?? "") >= today);
  const loginHref = loginUrl(path);
  // The consumption zone opens the tab of this contract (`?vertrag=`).
  const consumptionHref = `/verbrauch?vertrag=${encodeURIComponent(contract.contractId)}`;
  return (
    <Page eyebrow={t.title} title={t.divisions[contract.division]} aside={back}>
      <Stack gap="large">
        {contract.blocked && (
          <Banner
            icon="alert"
            title={t.blocked.title}
            data-testid="contract-blocked"
            action={
              <ButtonLink href="/postfach" variant="secondary">
                {t.blocked.action}
              </ButtonLink>
            }
          >
            {t.blocked.text}
          </Banner>
        )}
        <Split>
          <Card
            as="section"
            title={contract.tariffName}
            icon={divisionIcon(contract.division)}
            actions={<ContractStatus contract={contract} texts={t} locale={locale} />}
          >
            <Facts data-testid="contract" items={contractFacts(contract, t, locale)} />
            {(contract.meterNumber !== undefined || contract.dataVolumeMb !== undefined) && (
              <ButtonLink
                href={consumptionHref}
                variant="secondary"
                linkComponent={ZoneLink}
                className="zone-gap-top"
              >
                <Icon name="chart" />
                {contract.meterNumber !== undefined ? t.detail.toConsumption : t.detail.toUsage}
              </ButtonLink>
            )}
          </Card>
          <Card as="section" title={t.form.title}>
            {changeable ? (
              <ContractForm
                contract={contract}
                locale={locale}
                texts={t.form}
                optionLabels={t.options}
                {...(product ? { optionInfo: optionInfo(product, locale, t.prices) } : {})}
                amountLabel={
                  contract.installmentAdjustable ? t.detail.installment : t.detail.monthlyPrice
                }
                loginHref={loginHref}
              />
            ) : (
              <p className="kp-muted">
                {!running
                  ? t.detail.inactive
                  : contract.blocked
                    ? t.detail.blockedChange
                    : t.detail.fixed}
              </p>
            )}
          </Card>
        </Split>
        <Grid min="300px" className="zone-lifecycle">
          <TerminationCard
            contract={contract}
            locale={locale}
            texts={t.termination}
            loginHref={loginHref}
          />
          {withdrawal && (
            <WithdrawalCard
              contract={contract}
              locale={locale}
              texts={t.withdrawal}
              loginHref={loginHref}
            />
          )}
        </Grid>
      </Stack>
    </Page>
  );
}
