import type { Contract } from "@kundenportal/api-contract";
import { StatusBadge, formatDate } from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { Dictionary } from "@/i18n";
import { contractState } from "@/lib/lifecycle";

export interface ContractStatusProps {
  contract: Pick<Contract, "status"> & Partial<Pick<Contract, "termination" | "blocked">>;
  texts: Pick<Dictionary, "status" | "state">;
  locale: Locale;
}

/**
 * The contract's status as badges: "aktiv", "gekündigt zum 31.03.2027" (notice pending),
 * "beendet" or "widerrufen", and "gesperrt" next to it while the operator blocks it.
 */
export function ContractStatus({ contract, texts, locale }: ContractStatusProps) {
  const state = contractState(contract);
  const badge =
    state.kind === "noticed" ? (
      <StatusBadge tone="warn">
        {fill(texts.state.noticed, { date: formatDate(state.effectiveDate, locale) })}
      </StatusBadge>
    ) : state.kind === "active" ? (
      <StatusBadge tone="ok">{texts.status.active}</StatusBadge>
    ) : (
      <StatusBadge tone="neutral">{texts.state[state.kind]}</StatusBadge>
    );
  return (
    <span className="zone-badges">
      {badge}
      {contract.blocked && <StatusBadge tone="err">{texts.state.blocked}</StatusBadge>}
    </span>
  );
}
