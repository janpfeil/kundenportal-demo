"use client";

import type { Contract } from "@kundenportal/api-contract";
import { Button, Card, TextField, formatDate, formatDateTime } from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import { type FormEvent, useId, useState } from "react";
import type { Dictionary } from "@/i18n";
import {
  type LifecycleProblem,
  checkTerminationDate,
  contractState,
  earliestTermination,
  noticeMonths,
  terminationRule,
} from "@/lib/lifecycle";
import { monthsText } from "@/lib/products";
import { zonePath } from "@/lib/zone";
import {
  ActionFeedback,
  ConfirmStep,
  type Feedback,
  useCurrentContract,
  useLifecycleCall,
} from "./lifecycle-action";

export type TerminationTexts = Dictionary["termination"];

export interface TerminationCardProps {
  contract: Pick<
    Contract,
    "contractId" | "tariffName" | "status" | "minimumTermEndDate" | "updatedAt"
  > &
    Partial<
      Pick<Contract, "earliestTerminationDate" | "noticePeriodMonths" | "termination" | "blocked">
    >;
  locale: Locale;
  texts: TerminationTexts;
  loginHref: string;
}

const PROBLEM_TEXT: Record<LifecycleProblem, keyof TerminationTexts> = {
  session: "errorSession",
  blocked: "errorBlocked",
  conflict: "errorConflict",
  date: "errorDate",
  generic: "errorGeneric",
};

/**
 * Card "Kündigung": the rule in one sentence and the earliest date; a date field (not
 * before the earliest date) and a confirm step; once notice is given "Gekündigt zum …" with
 * "Kündigung zurücknehmen" until the date. Blocked contracts show why nothing is possible.
 */
export function TerminationCard({ contract, locale, texts, loginHref }: TerminationCardProps) {
  const [current, setSaved] = useCurrentContract(contract);
  const { busy, send } = useLifecycleCall();
  const dateId = useId();
  const earliest = earliestTermination(current);
  const [date, setDate] = useState(earliest);
  const [dateError, setDateError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const day = (iso: string) => formatDate(iso, locale);
  const state = contractState(current);
  const url = zonePath(`/api/contracts/${encodeURIComponent(current.contractId)}/termination`);

  const failed = (problem: LifecycleProblem) =>
    setFeedback({
      tone: "error",
      text: fill(texts[PROBLEM_TEXT[problem]], { date: day(earliest) }),
      login: problem === "session",
    });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    const check = checkTerminationDate(date, earliest);
    if (!check.ok) {
      const key =
        check.reason === "empty"
          ? "errorEmpty"
          : check.reason === "invalid"
            ? "errorInvalid"
            : "errorEarly";
      setDateError(fill(texts[key], { date: day(earliest) }));
      document.getElementById(dateId)?.focus();
      return;
    }
    setDateError(undefined);
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const result = await send("POST", url, { effectiveDate: check.date });
    setConfirming(false);
    if (!result.ok) return failed(result.problem);
    setSaved(result.contract);
    const end = result.contract.termination?.effectiveDate ?? check.date;
    setFeedback({ tone: "success", text: fill(texts.success, { date: day(end) }) });
  }

  async function revoke() {
    setFeedback(undefined);
    // POST, not DELETE: see the route handler `termination/cancel`.
    const result = await send("POST", `${url}/cancel`, {});
    if (!result.ok) return failed(result.problem);
    setSaved(result.contract);
    setDate(earliestTermination(result.contract));
    setFeedback({ tone: "success", text: texts.revoked });
  }

  const notice = monthsText(noticeMonths(current), {
    none: texts.noNotice,
    oneMonth: texts.oneMonth,
    months: texts.months,
  });

  return (
    <Card as="section" title={texts.title} icon="file">
      {state.kind === "noticed" && (
        <div className="zone-form" data-testid="termination-status">
          <p className="zone-state-title">
            {fill(texts.status, { date: day(state.effectiveDate) })}
          </p>
          {current.termination && (
            <p className="kp-muted zone-small">
              {fill(texts.received, {
                date: formatDateTime(current.termination.requestedAt, locale),
              })}
              {current.termination.by === "operator" && ` · ${texts.byOperator}`}
            </p>
          )}
          {current.termination?.reason && (
            <p className="zone-small">
              {fill(texts.reason, { reason: current.termination.reason })}
            </p>
          )}
          {current.blocked ? (
            <p className="kp-muted">{texts.blockedRevoke}</p>
          ) : (
            <>
              <p>{fill(texts.runsUntil, { date: day(state.effectiveDate) })}</p>
              <div className="zone-buttons">
                <Button variant="secondary" onClick={revoke} disabled={busy}>
                  {busy ? texts.revokeBusy : texts.revoke}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {(state.kind === "ended" || state.kind === "withdrawn") && (
        <p data-testid="termination-status">
          {state.kind === "withdrawn"
            ? texts.withdrawn
            : state.effectiveDate
              ? fill(texts.endedOn, { date: day(state.effectiveDate) })
              : texts.ended}
        </p>
      )}
      {state.kind === "active" && (
        <div className="zone-form">
          <p>
            {fill(terminationRule(current) === "term" ? texts.ruleTerm : texts.ruleNotice, {
              notice,
            })}
          </p>
          <p>
            {texts.earliest}: <strong>{day(earliest)}</strong>
          </p>
          {current.blocked ? (
            <p className="kp-muted">{texts.blocked}</p>
          ) : (
            <form className="zone-form" onSubmit={submit} noValidate data-testid="termination-form">
              <TextField
                id={dateId}
                type="date"
                label={texts.date}
                hint={fill(texts.dateHint, { date: day(earliest) })}
                error={dateError}
                min={earliest}
                value={date}
                readOnly={confirming}
                onChange={(event) => {
                  setDate(event.target.value);
                  setDateError(undefined);
                }}
                required
              />
              {confirming ? (
                <ConfirmStep
                  question={fill(texts.confirm, {
                    tariff: current.tariffName,
                    date: day(date),
                  })}
                  yes={texts.confirmYes}
                  no={texts.cancel}
                  busy={busy}
                  busyLabel={texts.busy}
                  onNo={() => setConfirming(false)}
                />
              ) : (
                <div className="zone-buttons">
                  <Button type="submit">{texts.submit}</Button>
                </div>
              )}
            </form>
          )}
        </div>
      )}
      <ActionFeedback feedback={feedback} loginHref={loginHref} loginLabel={texts.login} />
    </Card>
  );
}
