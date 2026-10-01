"use client";

import type { Contract, Problem } from "@kundenportal/api-contract";
import { Button, Notice } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { type LifecycleProblem, lifecycleProblem } from "@/lib/lifecycle";

export type Feedback = { tone: "success" | "error"; text: string; login?: boolean };

/**
 * The contract a card shows: the one the card saved last, unless the server has sent a
 * newer one since (e.g. after the other card ended the contract and the page refreshed).
 */
export function useCurrentContract<T extends Pick<Contract, "updatedAt">>(contract: T) {
  const [saved, setSaved] = useState<T>();
  const current = saved && saved.updatedAt >= contract.updatedAt ? saved : contract;
  return [current, setSaved] as const;
}

/**
 * Sends one lifecycle call (termination, taking it back, withdrawal) through the zone's
 * route and refreshes the page's server data on success, so badges and other cards follow.
 */
export function useLifecycleCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function send(
    method: "POST",
    url: string,
    body: unknown,
  ): Promise<{ ok: true; contract: Contract } | { ok: false; problem: LifecycleProblem }> {
    setBusy(true);
    try {
      const result = await sendJson<Contract | Problem>(method, url, body);
      if (result.ok && result.data && "contractId" in result.data) {
        router.refresh();
        return { ok: true, contract: result.data };
      }
      const detail = result.data && "detail" in result.data ? result.data.detail : undefined;
      return { ok: false, problem: lifecycleProblem(result.status, detail) };
    } catch {
      return { ok: false, problem: "generic" };
    } finally {
      setBusy(false);
    }
  }
  return { busy, send };
}

export interface ConfirmStepProps {
  question: string;
  yes: string;
  no: string;
  busy: boolean;
  busyLabel: string;
  onNo: () => void;
}

/**
 * The second step of a consequential action: the question (focused, so screen readers read
 * it), the confirming submit button and a way back. The surrounding form's submit sends.
 */
export function ConfirmStep({ question, yes, no, busy, busyLabel, onNo }: ConfirmStepProps) {
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div role="group" aria-labelledby={id} className="zone-confirm">
      <p id={id} ref={ref} tabIndex={-1} className="zone-confirm-question">
        {question}
      </p>
      <div className="zone-buttons">
        <Button type="submit" disabled={busy}>
          {busy ? busyLabel : yes}
        </Button>
        <Button variant="secondary" onClick={onNo} disabled={busy}>
          {no}
        </Button>
      </div>
    </div>
  );
}

/** Success or error after an action; errors may offer to sign in again. */
export function ActionFeedback({
  feedback,
  loginHref,
  loginLabel,
}: {
  feedback: Feedback | undefined;
  loginHref: string;
  loginLabel: string;
}) {
  if (!feedback) return null;
  return (
    <Notice tone={feedback.tone} className="zone-feedback">
      <p>{feedback.text}</p>
      {feedback.login && (
        <p>
          <a href={loginHref}>{loginLabel}</a>
        </p>
      )}
    </Notice>
  );
}
