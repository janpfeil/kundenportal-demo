"use client";

import type { Contract, ContractUpdate, Problem } from "@kundenportal/api-contract";
import { Button, Notice, NumberField, Select, formatEuro } from "@kundenportal/ui";
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
  >;
  locale: Locale;
  texts: ContractFormTexts;
  /** Visible names of the tariff options by id. */
  optionLabels: Record<string, string>;
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

/** J6: change the monthly installment (metered contracts) and/or the tariff option. */
export function ContractForm({
  contract,
  locale,
  texts,
  optionLabels,
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
  const range = {
    min: euro(current.installmentMinCent ?? 0),
    max: euro(current.installmentMaxCent ?? 0),
  };
  const label = (id: string) => optionLabels[id] ?? id;

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
        <NumberField
          id={installmentId}
          label={texts.installment}
          hint={fill(texts.installmentHint, range)}
          error={fieldError}
          unit="€"
          name="installment"
          inputMode="numeric"
          step={1}
          min={(current.installmentMinCent ?? 0) / 100}
          max={
            current.installmentMaxCent !== undefined ? current.installmentMaxCent / 100 : undefined
          }
          value={installment}
          onChange={(event) => setInstallment(event.target.value)}
          required
        />
      )}
      {current.tariffOptions.length > 1 && (
        <Select
          label={texts.option}
          name="tariffOption"
          value={option}
          onChange={(event) => setOption(event.target.value)}
          options={current.tariffOptions.map((id) => ({ value: id, label: label(id) }))}
        />
      )}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? texts.busy : texts.submit}
        </Button>
      </div>
      {feedback && (
        <Notice tone={feedback.tone}>
          <p>{feedback.text}</p>
          {feedback.login && (
            <p>
              <a href={loginHref}>{texts.login}</a>
            </p>
          )}
        </Notice>
      )}
    </form>
  );
}
