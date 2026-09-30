import type { Contract } from "@kundenportal/api-contract";
import { Badge, ButtonLink, Card, type Fact, Facts, Notice, Page } from "@kundenportal/ui";
import type { Locale } from "@kundenportal/ui/i18n";
import { apiFor, loginUrl } from "@kundenportal/web-auth";
import { notFound } from "next/navigation";
import { ContractForm } from "@/components/contract-form";
import { type Dictionary, dictionary } from "@/i18n";
import { isContractId } from "@/lib/contract-update";
import {
  formatDataVolume,
  formatDate,
  formatEuro,
  formatQuantity,
  formatUnitPrice,
} from "@/lib/format";
import { requireSession } from "@/lib/session";
import { fill, zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

function facts(contract: Contract, t: Dictionary, locale: Locale): Fact[] {
  const euro = (cents: number) => formatEuro(cents, locale);
  const unit = contract.unit === "m3" ? "m³" : contract.unit;
  const items: (Fact | false)[] = [
    {
      term: t.detail.contractId,
      description: <span className="zone-break">{contract.contractId}</span>,
      id: "id",
    },
    { term: t.detail.division, description: t.divisions[contract.division] },
    { term: t.detail.tariff, description: contract.tariffName },
    {
      term: t.detail.option,
      description: t.options[contract.tariffOption] ?? contract.tariffOption,
    },
    {
      term: contract.installmentAdjustable ? t.detail.installment : t.detail.monthlyPrice,
      description: euro(contract.monthlyInstallmentCent),
    },
    contract.installmentAdjustable &&
      contract.installmentMinCent !== undefined &&
      contract.installmentMaxCent !== undefined && {
        term: t.detail.range,
        description: fill(t.detail.rangeValue, {
          min: euro(contract.installmentMinCent),
          max: euro(contract.installmentMaxCent),
        }),
      },
    contract.installmentAdjustable && {
      term: t.detail.basePrice,
      description: euro(contract.monthlyPriceCent),
    },
    contract.workPriceCent !== undefined &&
      unit !== undefined && {
        term: t.detail.workPrice,
        description: fill(t.detail.perUnit, {
          price: formatUnitPrice(contract.workPriceCent, locale),
          unit,
        }),
      },
    contract.meterNumber !== undefined && {
      term: t.detail.meter,
      description: contract.meterNumber,
    },
    contract.estimatedAnnualConsumption !== undefined &&
      contract.unit !== undefined && {
        term: t.detail.annual,
        description: formatQuantity(contract.estimatedAnnualConsumption, contract.unit, locale),
      },
    contract.dataVolumeMb !== undefined && {
      term: t.detail.dataVolume,
      description: formatDataVolume(contract.dataVolumeMb, locale),
    },
    { term: t.detail.start, description: formatDate(contract.startDate, locale) },
    {
      term: t.detail.term,
      description: fill(t.detail.months, { count: contract.minimumTermMonths }),
    },
    { term: t.detail.termEnd, description: formatDate(contract.minimumTermEndDate, locale) },
    {
      term: t.detail.status,
      description: (
        <Badge tone={contract.status === "active" ? "success" : "neutral"}>
          {t.status[contract.status]}
        </Badge>
      ),
      id: "status",
    },
  ];
  return items.filter((item): item is Fact => item !== false && item !== undefined);
}

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
      <Page title={t.title} actions={back}>
        <Notice tone="error">{missing ? t.detail.notFound : t.detail.error}</Notice>
      </Page>
    );
  }

  const title = `${t.divisions[contract.division]} · ${contract.tariffName}`;
  const changeable =
    contract.status === "active" &&
    (contract.installmentAdjustable || contract.tariffOptions.length > 1);
  return (
    <Page title={title} actions={back}>
      <Card title={t.detail.facts} className="zone-section">
        <Facts data-testid="contract" items={facts(contract, t, locale)} />
        {contract.meterNumber !== undefined && (
          <p>
            <a href="/verbrauch">{t.detail.toConsumption}</a>
          </p>
        )}
      </Card>
      {changeable && (
        <Card title={t.form.title} className="zone-section">
          {contract.installmentAdjustable && <p className="kp-muted">{t.form.intro}</p>}
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
        </Card>
      )}
    </Page>
  );
}
