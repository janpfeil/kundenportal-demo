"use client";

import { Button, Notice, Select, type SelectOption, TextField, formatDate } from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import type { Dictionary } from "@/i18n";
import {
  type ActionType,
  CONFIRMED,
  type ContractAction,
  REASON_MAX,
  reasonProblem,
} from "@/lib/contracts";
import { failureText } from "@/lib/feedback";
import { parseEuro } from "@/lib/money";
import { zonePath } from "@/lib/zone";

type Texts = Dictionary["operator"]["actions"];

export interface ProductChoice {
  productId: string;
  name: string;
  options: readonly SelectOption[];
}

export interface ContractActionsProps {
  contractId: string;
  /** The actions this contract allows now, in display order. */
  actions: readonly ActionType[];
  /** Options of the contract's product other than the current one. */
  options: readonly SelectOption[];
  /** Orderable products of the same division with their options. */
  products: readonly ProductChoice[];
  /** Current and newest price version, if the product has a newer one. */
  versions?: { from: number; to: number } | undefined;
  /** The current installment, already formatted, e.g. "87,00 €". */
  installment: string;
  /** Earliest end a notice reaches by the contract's rules (default of the date field). */
  earliestTermination?: string | undefined;
  /** The pending termination's date, already formatted. */
  pendingTermination?: string | undefined;
  /** Today in German time (`YYYY-MM-DD`), the earliest date the operator may terminate to. */
  today: string;
  texts: Texts;
  locale: Locale;
}

type Feedback = { tone: "success" | "error"; text: string };
type Errors = Partial<Record<"reason" | "installment" | "date", string>>;

/**
 * The operator's controls of one contract: choose an action, fill its fields and a reason
 * (3–300 characters), send. Terminating and blocking ask a second time. The zone forwards
 * the action to POST /admin/contracts/{id}/actions; on success the page reloads its data
 * (status, facts, history).
 */
export function ContractActions(props: ContractActionsProps) {
  const { contractId, actions, options, products, versions, texts } = props;
  const router = useRouter();
  const formId = useId();
  const [chosen, setType] = useState<ActionType | undefined>(actions[0]);
  // After an action the page reloads with the actions the contract allows now (a notice
  // turns "Kündigen" into "Kündigung zurücknehmen"); a choice that is gone falls back.
  const type = chosen && actions.includes(chosen) ? chosen : actions[0];
  const [option, setOption] = useState(options[0]?.value ?? "");
  const [productId, setProductId] = useState(products[0]?.productId ?? "");
  const [productOption, setProductOption] = useState(products[0]?.options[0]?.value ?? "");
  const [installment, setInstallment] = useState("");
  const [date, setDate] = useState(props.earliestTermination ?? "");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState<ContractAction>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();

  if (!type || actions.length === 0) {
    return (
      <p className="kp-muted cockpit-small" data-testid="contract-actions">
        {texts.none}
      </p>
    );
  }

  const product = products.find((entry) => entry.productId === productId);

  function choose(next: ActionType) {
    setType(next);
    setErrors({});
    setConfirming(undefined);
    setFeedback(undefined);
  }

  /** The action of the form, or the problems per field. */
  function build(): ContractAction | undefined {
    const next: Errors = {};
    const problem = reasonProblem(reason);
    if (problem) next.reason = problem === "short" ? texts.reasonShort : texts.reasonLong;
    let action: ContractAction | undefined;
    const why = reason.trim();
    switch (type) {
      case "changeOption":
        action = { type, optionId: option, reason: why };
        break;
      case "changeProduct":
        action = { type, productId, optionId: productOption, reason: why };
        break;
      case "setInstallment": {
        const cents = parseEuro(installment);
        if (cents === undefined || cents < 100) next.installment = texts.installmentInvalid;
        else action = { type, monthlyInstallmentCent: cents, reason: why };
        break;
      }
      case "terminate":
        if (date && date < props.today) next.date = texts.dateInvalid;
        else action = date ? { type, effectiveDate: date, reason: why } : { type, reason: why };
        break;
      case "applyPriceVersion":
      case "cancelTermination":
      case "block":
      case "unblock":
        action = { type, reason: why };
        break;
    }
    setErrors(next);
    return Object.keys(next).length > 0 ? undefined : action;
  }

  async function send(action: ContractAction) {
    setBusy(true);
    setFeedback(undefined);
    const result = await sendJson(
      "POST",
      zonePath(`/api/contracts/${encodeURIComponent(contractId)}/actions`),
      action,
    ).catch(() => ({ ok: false, status: 0 }));
    setBusy(false);
    setConfirming(undefined);
    if (!result.ok) {
      setFeedback({ tone: "error", text: failureText(result.status, texts.errors) });
      return;
    }
    setReason("");
    setInstallment("");
    setFeedback({ tone: "success", text: fill(texts.done, { action: texts.types[action.type] }) });
    router.refresh();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = build();
    if (!action) return;
    if (CONFIRMED.has(action.type)) setConfirming(action);
    else void send(action);
  }

  const confirmText =
    confirming?.type === "terminate"
      ? confirming.effectiveDate
        ? fill(texts.confirmTerminate, { date: formatDate(confirming.effectiveDate, props.locale) })
        : texts.confirmTerminateEarliest
      : texts.confirmBlock;

  return (
    <form
      className="cockpit-action-form"
      onSubmit={submit}
      noValidate
      data-testid="contract-actions"
      data-action={type}
      aria-labelledby={`${formId}-legend`}
    >
      <p id={`${formId}-legend`} className="kp-sr-only">
        {texts.title}
      </p>
      <Select
        label={texts.choose}
        name="type"
        value={type}
        onChange={(event) => choose(event.target.value as ActionType)}
        options={actions.map((value) => ({ value, label: texts.types[value] }))}
        data-testid="action-type"
      />
      {type === "changeOption" && (
        <Select
          label={texts.option}
          name="optionId"
          value={option}
          onChange={(event) => setOption(event.target.value)}
          options={options}
        />
      )}
      {type === "changeProduct" && (
        <>
          <Select
            label={texts.product}
            name="productId"
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              const next = products.find((entry) => entry.productId === event.target.value);
              setProductOption(next?.options[0]?.value ?? "");
            }}
            options={products.map((entry) => ({ value: entry.productId, label: entry.name }))}
          />
          <Select
            label={texts.productOption}
            name="productOption"
            value={productOption}
            onChange={(event) => setProductOption(event.target.value)}
            options={product?.options ?? []}
          />
        </>
      )}
      {type === "applyPriceVersion" && versions && (
        <p className="cockpit-small">{fill(texts.priceVersion, versions)}</p>
      )}
      {type === "setInstallment" && (
        <TextField
          label={texts.installment}
          hint={fill(texts.installmentHint, { current: props.installment })}
          name="monthlyInstallment"
          inputMode="decimal"
          autoComplete="off"
          value={installment}
          onChange={(event) => setInstallment(event.target.value)}
          error={errors.installment}
        />
      )}
      {type === "terminate" && (
        <TextField
          type="date"
          label={texts.effectiveDate}
          hint={fill(texts.effectiveHint, {
            date: props.earliestTermination
              ? formatDate(props.earliestTermination, props.locale)
              : "–",
          })}
          name="effectiveDate"
          min={props.today}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          error={errors.date}
        />
      )}
      {type === "cancelTermination" && (
        <p className="cockpit-small">
          {fill(texts.cancelHint, { date: props.pendingTermination ?? "–" })}
        </p>
      )}
      {type === "block" && <p className="cockpit-small">{texts.blockHint}</p>}
      {type === "unblock" && <p className="cockpit-small">{texts.unblockHint}</p>}
      <ReasonField
        label={texts.reason}
        hint={texts.reasonHint}
        value={reason}
        onChange={setReason}
        error={errors.reason}
      />
      {confirming ? (
        <div className="cockpit-confirm" role="group" aria-label={confirmText}>
          <p className="cockpit-small">
            <strong>{confirmText}</strong>
          </p>
          <div className="cockpit-actions">
            <Button
              className="cockpit-button-small cockpit-button-danger-solid"
              disabled={busy}
              onClick={() => void send(confirming)}
            >
              {busy ? texts.sending : texts.confirm}
            </Button>
            <Button
              variant="secondary"
              className="cockpit-button-small"
              onClick={() => setConfirming(undefined)}
            >
              {texts.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="submit"
            disabled={busy}
            className={
              type === "terminate" || type === "block" ? "cockpit-button-danger" : undefined
            }
            variant={type === "terminate" || type === "block" ? "secondary" : "primary"}
          >
            {busy ? texts.sending : texts.types[type]}
          </Button>
        </div>
      )}
      {feedback && (
        <Notice tone={feedback.tone} data-testid="action-feedback">
          {feedback.text}
        </Notice>
      )}
    </form>
  );
}

/** A multi-line reason with label, hint and error, styled like the library's fields. */
export function ReasonField({
  label,
  hint,
  value,
  onChange,
  error,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  const id = useId();
  return (
    <div className="kp-field">
      <label className="kp-label" htmlFor={id}>
        {label}
      </label>
      <span className="kp-hint" id={`${id}-hint`}>
        {hint}
      </span>
      <textarea
        id={id}
        name="reason"
        className="kp-input cockpit-textarea"
        rows={2}
        maxLength={REASON_MAX}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={error !== undefined ? `${id}-hint ${id}-error` : `${id}-hint`}
      />
      {error !== undefined && (
        <span className="kp-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
