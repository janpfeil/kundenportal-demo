"use client";

import type { Contract, ContractUpdate, Problem } from "@kundenportal/api-contract";
import { Button, Notice, NumberField, OptionCards, formatCent, formatEuro } from "@kundenportal/ui";
import type { Locale } from "@kundenportal/ui/i18n";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import type { Dictionary } from "@/i18n";
import {
  type ContractProblem,
  contractProblem,
  parseInstallmentEuros,
} from "@/lib/contract-update";
import { formatWholeEuro, unitLabel } from "@/lib/format";
import { fill } from "@kundenportal/ui/i18n";
import { zonePath } from "@/lib/zone";

export type ContractFormTexts = Dictionary["form"];

export interface ContractFormProps {
  contract: Pick<
    Contract,
    | "contractId"
    | "tariffOption"
    | "tariffOptions"
    | "monthlyInstallmentCent"
    | "installmentAdjustable"
    | "installmentMinCent"
    | "installmentMaxCent"
  > &
    Partial<Pick<Contract, "workPriceCent" | "unit" | "monthlyPriceCent">>;
  locale: Locale;
  texts: ContractFormTexts;
  /** Visible names of the tariff options by id. */
  optionLabels: Record<string, string>;
  /**
   * Names and prices of the options from the contract's product (phase 7), where the
   * catalogue still lists it; they take precedence over `optionLabels`.
   */
  optionInfo?: Readonly<Record<string, { label: string; price?: string }>>;
  /** "Abschlag" or "Monatspreis", as on the page. */
  amountLabel: string;
  loginHref: string;
}

type Feedback = { tone: "info" | "success" | "error"; text: string; login?: boolean };

const PROBLEM_TEXT: Record<ContractProblem, keyof ContractFormTexts> = {
  session: "errorSession",
  conflict: "errorConflict",
  range: "errorRange",
  whole: "errorWhole",
  fixed: "errorFixed",
  option: "errorOption",
  generic: "errorGeneric",
};

/**
 * The price of the contract's current option, as far as the API tells it: the unit price of
 * a metered contract ("32 ct/kWh"), else the monthly price. Other options' prices are unknown.
 */
function currentPrice(
  contract: ContractFormProps["contract"],
  locale: Locale,
  texts: ContractFormTexts,
): string | undefined {
  if (contract.workPriceCent !== undefined && contract.unit !== undefined)
    return fill(texts.optionPrice, {
      price: formatCent(contract.workPriceCent, locale),
      unit: unitLabel(contract.unit),
    });
  if (!contract.installmentAdjustable && contract.monthlyPriceCent !== undefined)
    return formatEuro(contract.monthlyPriceCent, locale);
  return undefined;
}

/**
 * J6: change the monthly installment (metered contracts, number field and slider in sync)
 * and/or the tariff option (option cards).
 */
export function ContractForm({
  contract,
  locale,
  texts,
  optionLabels,
  optionInfo,
  amountLabel,
  loginHref,
}: ContractFormProps) {
  const router = useRouter();
  const installmentId = useId();
  const [current, setCurrent] = useState(contract);
  const [installment, setInstallment] = useState(String(contract.monthlyInstallmentCent / 100));
  const [option, setOption] = useState(contract.tariffOption);
  const [fieldError, setFieldError] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [busy, setBusy] = useState(false);

  const euro = (cents: number) => formatEuro(cents, locale);
  const minEuro = Math.ceil((current.installmentMinCent ?? 100) / 100);
  const maxEuro =
    current.installmentMaxCent !== undefined
      ? Math.floor(current.installmentMaxCent / 100)
      : Math.max(minEuro, Math.ceil(current.monthlyInstallmentCent / 100) * 2);
  const typed = Number(installment.trim().replace(",", "."));
  // The slider follows the field; while the field holds no valid number it stays put.
  const slider = Math.min(
    maxEuro,
    Math.max(
      minEuro,
      Number.isFinite(typed) && installment.trim() !== ""
        ? Math.round(typed)
        : current.monthlyInstallmentCent / 100,
    ),
  );
  const range = {
    min: formatWholeEuro(current.installmentMinCent ?? 0, locale),
    max: formatWholeEuro(current.installmentMaxCent ?? 0, locale),
  };
  const label = (id: string) => optionInfo?.[id]?.label ?? optionLabels[id] ?? id;
  const price = currentPrice(current, locale, texts);
  // The current option shows what the contract pays; the others the catalogue's price.
  const optionNote = (id: string) => {
    if (id === current.tariffOption) {
      const own = price ?? optionInfo?.[id]?.price;
      return own ? `${texts.current} · ${own}` : texts.current;
    }
    return optionInfo?.[id]?.price;
  };

  function reset() {
    setInstallment(String(current.monthlyInstallmentCent / 100));
    setOption(current.tariffOption);
    setFieldError(undefined);
    setFeedback(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    const update: ContractUpdate = {};
    if (current.installmentAdjustable) {
      const checked = parseInstallmentEuros(
        installment,
        current.installmentMinCent,
        current.installmentMaxCent,
      );
      if (!checked.ok) {
        const key =
          checked.reason === "empty"
            ? "errorEmpty"
            : checked.reason === "whole"
              ? "errorWhole"
              : "errorRange";
        setFieldError(fill(texts[key], range));
        document.getElementById(installmentId)?.focus();
        return;
      }
      if (checked.cents !== current.monthlyInstallmentCent)
        update.monthlyInstallmentCent = checked.cents;
    }
    setFieldError(undefined);
    if (option !== current.tariffOption) update.tariffOption = option;
    if (Object.keys(update).length === 0) {
      setFeedback({ tone: "info", text: texts.unchanged });
      return;
    }

    setBusy(true);
    try {
      const result = await sendJson<Contract | Problem>(
        "PATCH",
        zonePath(`/api/contracts/${encodeURIComponent(current.contractId)}`),
        update,
      );
      if (result.ok && result.data && "contractId" in result.data) {
        const saved = result.data;
        setCurrent(saved);
        setInstallment(String(saved.monthlyInstallmentCent / 100));
        setOption(saved.tariffOption);
        setFeedback({
          tone: "success",
          text: fill(texts.success, {
            option: label(saved.tariffOption),
            label: amountLabel,
            amount: euro(saved.monthlyInstallmentCent),
          }),
        });
        router.refresh();
        return;
      }
      const detail = result.data && "detail" in result.data ? result.data.detail : undefined;
      const kind = contractProblem(result.status, detail);
      setFeedback({
        tone: "error",
        text: fill(texts[PROBLEM_TEXT[kind]], range),
        login: kind === "session",
      });
    } catch {
      setFeedback({ tone: "error", text: texts.errorGeneric });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="zone-form"
      onSubmit={submit}
      noValidate
      data-testid="contract-installment-form"
    >
      {current.installmentAdjustable && (
        <>
          <p className="kp-muted zone-small">{texts.intro}</p>
          <div className="zone-installment">
            <NumberField
              id={installmentId}
              label={texts.installment}
              hint={fill(texts.installmentHint, range)}
              error={fieldError}
              unit="€"
              name="installment"
              inputMode="numeric"
              step={1}
              min={minEuro}
              max={current.installmentMaxCent !== undefined ? maxEuro : undefined}
              value={installment}
              onChange={(event) => setInstallment(event.target.value)}
              required
            />
            <input
              type="range"
              className="zone-range"
              min={minEuro}
              max={maxEuro}
              step={1}
              value={slider}
              aria-label={texts.slider}
              aria-valuetext={formatWholeEuro(slider * 100, locale)}
              aria-controls={installmentId}
              onChange={(event) => {
                setInstallment(event.target.value);
                setFieldError(undefined);
              }}
            />
          </div>
        </>
      )}
      {current.tariffOptions.length > 1 && (
        <OptionCards
          legend={texts.option}
          name="tariffOption"
          value={option}
          onChange={setOption}
          options={current.tariffOptions.map((id) => ({
            value: id,
            label: label(id),
            price: optionNote(id),
          }))}
        />
      )}
      {feedback && (
        <Notice tone={feedback.tone} className="zone-feedback">
          <p>{feedback.text}</p>
          {feedback.login && (
            <p>
              <a href={loginHref}>{texts.login}</a>
            </p>
          )}
        </Notice>
      )}
      <div className="zone-buttons">
        <Button type="submit" disabled={busy}>
          {busy ? texts.busy : texts.submit}
        </Button>
        <Button variant="secondary" onClick={reset} disabled={busy}>
          {texts.cancel}
        </Button>
      </div>
    </form>
  );
}
