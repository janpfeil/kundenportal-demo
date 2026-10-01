import type { Contract } from "@kundenportal/api-contract";
import {
  ButtonLink,
  Card,
  Facts,
  Icon,
  Notice,
  Page,
  Split,
  StatusBadge,
  divisionIcon,
} from "@kundenportal/ui";
import { apiFor, loginUrl } from "@kundenportal/web-auth";
import { requireSession } from "@kundenportal/web-auth/pages";
import { notFound } from "next/navigation";
import { ContractForm } from "@/components/contract-form";
import { dictionary } from "@/i18n";
import { isContractId } from "@/lib/contract-update";
import { contractFacts } from "@/lib/facts";
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

  let contract: Contract | undefined;
  let missing = false;
  try {
    const result = await apiFor(session).GET("/contracts/{contractId}", {
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

  const changeable =
    contract.status === "active" &&
    (contract.installmentAdjustable || contract.tariffOptions.length > 1);
  // The consumption zone opens the tab of this contract (`?vertrag=`).
  const consumptionHref = `/verbrauch?vertrag=${encodeURIComponent(contract.contractId)}`;
  return (
    <Page eyebrow={t.title} title={t.divisions[contract.division]} aside={back}>
      <Split>
        <Card
          as="section"
          title={contract.tariffName}
          icon={divisionIcon(contract.division)}
          actions={
            <StatusBadge tone={contract.status === "active" ? "ok" : "neutral"}>
              {t.status[contract.status]}
            </StatusBadge>
          }
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
              amountLabel={
                contract.installmentAdjustable ? t.detail.installment : t.detail.monthlyPrice
              }
              loginHref={loginUrl(path)}
            />
          ) : (
            <p className="kp-muted">
              {contract.status === "active" ? t.detail.fixed : t.detail.inactive}
            </p>
          )}
        </Card>
      </Split>
    </Page>
  );
}
