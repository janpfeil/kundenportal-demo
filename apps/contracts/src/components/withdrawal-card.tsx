"use client";

import type { Contract } from "@kundenportal/api-contract";
import { Button, Card, formatDate } from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import { type FormEvent, useState } from "react";
import type { Dictionary } from "@/i18n";
import { type LifecycleProblem, contractState } from "@/lib/lifecycle";
import { zonePath } from "@/lib/zone";
import {
  ActionFeedback,
  ConfirmStep,
  type Feedback,
  useCurrentContract,
  useLifecycleCall,
} from "./lifecycle-action";

export type WithdrawalTexts = Dictionary["withdrawal"];

export interface WithdrawalCardProps {
  contract: Pick<Contract, "contractId" | "tariffName" | "status" | "updatedAt"> &
    Partial<Pick<Contract, "withdrawableUntil" | "termination" | "blocked">>;
  locale: Locale;
  texts: WithdrawalTexts;
  loginHref: string;
}

const PROBLEM_TEXT: Record<LifecycleProblem, keyof WithdrawalTexts> = {
  session: "errorSession",
  blocked: "errorBlocked",
  conflict: "errorConflict",
  date: "errorDate",
  generic: "errorGeneric",
};

/**
 * Card "Widerruf", shown while the 14 days after ordering in the portal run (and right after
 * a withdrawal, to confirm it): the explanation, "Vertrag widerrufen …" and a confirm step.
 */
export function WithdrawalCard({ contract, locale, texts, loginHref }: WithdrawalCardProps) {
  const [current, setSaved] = useCurrentContract(contract);
  const { busy, send } = useLifecycleCall();
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const withdrawn = contractState(current).kind === "withdrawn";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const result = await send(
      "POST",
      zonePath(`/api/contracts/${encodeURIComponent(current.contractId)}/withdrawal`),
      {},
    );
    setConfirming(false);
    if (!result.ok) {
      setFeedback({
        tone: "error",
        text: texts[PROBLEM_TEXT[result.problem]],
        login: result.problem === "session",
      });
      return;
    }
    setSaved(result.contract);
    setFeedback({ tone: "success", text: texts.success });
  }

  return (
    <Card as="section" title={texts.title} icon="refresh">
      {withdrawn ? (
        feedback === undefined && <p>{texts.done}</p>
      ) : (
        <div className="zone-form">
          {current.withdrawableUntil && (
            <p>{fill(texts.text, { date: formatDate(current.withdrawableUntil, locale) })}</p>
          )}
          {current.blocked ? (
            <p className="kp-muted">{texts.blocked}</p>
          ) : (
            <form className="zone-form" onSubmit={submit} noValidate data-testid="withdrawal-form">
              {confirming ? (
                <ConfirmStep
                  question={fill(texts.confirm, { tariff: current.tariffName })}
                  yes={texts.confirmYes}
                  no={texts.cancel}
                  busy={busy}
                  busyLabel={texts.busy}
                  onNo={() => setConfirming(false)}
                />
              ) : (
                <div className="zone-buttons">
                  <Button type="submit" variant="secondary">
                    {texts.submit}
                  </Button>
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
