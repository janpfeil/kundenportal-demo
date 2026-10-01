import type { Contract } from "@kundenportal/api-contract";
import {
  type Fact,
  formatDataVolume,
  formatDate,
  formatEuro,
  formatQuantity,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { Dictionary } from "@/i18n";
import { formatCent, shortContractId, unitLabel } from "./format";
import { monthsText } from "./products";

/** The contract's facts in the mockup's order; what a division does not have is left out. */
export function contractFacts(contract: Contract, t: Dictionary, locale: Locale): Fact[] {
  const euro = (cents: number) => formatEuro(cents, locale);
  const items: (Fact | false)[] = [
    {
      term: t.detail.contractId,
      description: (
        <span className="kp-mono" title={contract.contractId}>
          {shortContractId(contract.contractId)}
        </span>
      ),
      id: "id",
    },
    {
      term: t.detail.option,
      description: t.options[contract.tariffOption] ?? contract.tariffOption,
    },
    {
      term: contract.installmentAdjustable ? t.detail.installment : t.detail.monthlyPrice,
      description: euro(contract.monthlyInstallmentCent),
    },
    contract.installmentAdjustable && {
      term: t.detail.basePrice,
      description: euro(contract.monthlyPriceCent),
    },
    contract.workPriceCent !== undefined &&
      contract.unit !== undefined && {
        term: t.detail.workPrice,
        description: fill(t.detail.perUnit, {
          price: formatCent(contract.workPriceCent, locale),
          unit: unitLabel(contract.unit),
        }),
      },
    contract.meterNumber !== undefined && {
      term: t.detail.meter,
      description: <span className="kp-mono">{contract.meterNumber}</span>,
      id: "meter",
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
    {
      term: t.detail.start,
      description: fill(t.detail.startTerm, {
        date: formatDate(contract.startDate, locale),
        count: contract.minimumTermMonths,
      }),
    },
    { term: t.detail.termEnd, description: formatDate(contract.minimumTermEndDate, locale) },
    contract.noticePeriodMonths !== undefined && {
      term: t.detail.noticePeriod,
      description: monthsText(contract.noticePeriodMonths, t.catalogue),
    },
  ];
  return items.filter((item): item is Fact => item !== false && item !== undefined);
}
