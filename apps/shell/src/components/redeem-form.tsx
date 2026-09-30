"use client";

import { Button, ButtonLink, Notice } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { type RedeemError, redeemError, tokenFromHash } from "@/lib/redeem";

type Phase = "loading" | "noToken" | "ready" | "sending" | "done";

/**
 * Redeems an invitation. The token comes from the URL fragment, which browsers never send
 * to a server; it leaves the browser only in the body of the redeem request. The ALTCHA
 * widget fetches its challenge from the shell and solves it in the browser.
 */
export function RedeemForm({ texts, locale }: { texts: Dictionary["redeem"]; locale: Locale }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<RedeemError | "verifyFirst" | undefined>();
  const [verified, setVerified] = useState(false);
  const token = useRef<string | undefined>(undefined);
  const payload = useRef<string | undefined>(undefined);
  const widget = useRef<HTMLElement>(null);
  const result = useRef<HTMLDivElement>(null);

  useEffect(() => {
    token.current = tokenFromHash(window.location.hash);
    setPhase(token.current ? "ready" : "noToken");
    // The widget is a web component; load it (and its texts) only in the browser.
    void import("altcha").then(() =>
      locale === "de" ? import("altcha/i18n/de") : import("altcha/i18n/en"),
    );
  }, [locale]);

  useEffect(() => {
    const element = widget.current;
    if (!element) return;
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string; payload?: string }>).detail;
      payload.current = detail?.state === "verified" ? detail.payload : undefined;
      setVerified(Boolean(payload.current));
      if (payload.current) setError((current) => (current === "verifyFirst" ? undefined : current));
    };
    element.addEventListener("statechange", onState);
    return () => element.removeEventListener("statechange", onState);
  }, [phase]);

  useEffect(() => {
    if (phase === "done") result.current?.focus();
  }, [phase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const altcha = payload.current ?? String(new FormData(event.currentTarget).get("altcha") ?? "");
    if (!altcha) {
      setError("verifyFirst");
      return;
    }
    setPhase("sending");
    setError(undefined);
    const response = await sendJson("POST", "/pass/einloesen/api", {
      token: token.current,
      altcha,
    }).catch(() => ({ ok: false, status: 0 }));
    if (response.ok) {
      // The token is used up; drop it from the address bar and the history entry.
      window.history.replaceState(null, "", window.location.pathname);
      setPhase("done");
      return;
    }
    setError(redeemError(response.status));
    setPhase("ready");
    // A solved challenge is single-use: ask the widget for a fresh one.
    payload.current = undefined;
    setVerified(false);
    (widget.current as (HTMLElement & { reset?: () => void }) | null)?.reset?.();
  }

  if (phase === "done") {
    return (
      <div ref={result} tabIndex={-1} data-testid="redeem-done">
        <Notice tone="success" title={texts.done.title}>
          <p>{texts.done.text}</p>
          <p>{texts.done.hint}</p>
        </Notice>
        <ButtonLink href="/auth/login?returnTo=/pass">{texts.done.signIn}</ButtonLink>
      </div>
    );
  }
  if (phase === "noToken") {
    return (
      <Notice tone="error" data-testid="redeem-error">
        {texts.noToken}
      </Notice>
    );
  }

  return (
    <form
      onSubmit={submit}
      data-testid="redeem-form"
      data-verified={verified}
      aria-busy={phase === "sending"}
    >
      <p className="kp-muted">{texts.check}</p>
      <div className="redeem-check">
        <altcha-widget
          ref={widget}
          challenge="/pass/einloesen/challenge"
          name="altcha"
          language={locale}
          auto="onload"
        />
      </div>
      <Button type="submit" disabled={phase !== "ready"} data-testid="redeem-submit">
        {phase === "sending" ? texts.sending : texts.submit}
      </Button>
      {error !== undefined && (
        <Notice tone="error" data-testid="redeem-error" data-error={error}>
          {error === "verifyFirst" ? texts.verifyFirst : texts.errors[error]}
        </Notice>
      )}
    </form>
  );
}
