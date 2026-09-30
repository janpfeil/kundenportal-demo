"use client";

import { Button, Notice, NumberField, TextField } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { fill, zonePath } from "@/lib/zone";

type Created = { link: string; expiresAt: string };
type Failure = "invalid" | "conflict" | "failed";

/**
 * Creates an invitation and shows its link once, with a copy button. The system sends no
 * e-mail; the owner passes the link on. Writes go through sendJson (x-amz-content-sha256).
 */
export function InvitationForm({
  texts,
  locale,
}: {
  texts: Dictionary["passes"]["invite"];
  locale: Locale;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created>();
  const [failure, setFailure] = useState<Failure>();
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minutes = String(form.get("validMinutes") ?? "").trim();
    setBusy(true);
    setFailure(undefined);
    setCreated(undefined);
    setCopy("idle");
    const result = await sendJson<Created>("POST", zonePath("/api/invitations"), {
      email: String(form.get("email") ?? "").trim(),
      ...(minutes ? { validMinutes: Number(minutes) } : {}),
    }).catch(() => ({ ok: false, status: 0, data: undefined }));
    setBusy(false);
    if (result.ok && result.data?.link) {
      setCreated(result.data);
      router.refresh();
      return;
    }
    setFailure(result.status === 400 ? "invalid" : result.status === 409 ? "conflict" : "failed");
  }

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <form onSubmit={submit} data-testid="invitation-form" aria-busy={busy}>
      <TextField
        name="email"
        type="email"
        label={texts.email}
        hint={texts.emailHint}
        required
        maxLength={254}
        autoComplete="off"
      />
      <NumberField
        name="validMinutes"
        label={texts.minutes}
        hint={texts.minutesHint}
        min={1}
        max={60}
        step={1}
      />
      <Button type="submit" disabled={busy}>
        {busy ? texts.sending : texts.submit}
      </Button>
      {failure && <Notice tone="error">{texts[failure]}</Notice>}
      {created && (
        <Notice tone="success" title={texts.created} data-testid="invitation-created">
          <p>
            <strong>{texts.link}:</strong>{" "}
            <code className="zone-break" data-testid="invitation-link">
              {created.link}
            </code>
          </p>
          <p className="kp-muted">
            {fill(texts.expiresAt, {
              date: formatDateTime(created.expiresAt, locale),
            })}
          </p>
          <p className="cockpit-actions">
            <Button variant="secondary" onClick={copyLink} aria-label={texts.copyLink}>
              {texts.copy}
            </Button>
            <span role="status" className="kp-muted">
              {copy === "copied" ? texts.copied : copy === "failed" ? texts.copyFailed : ""}
            </span>
          </p>
        </Notice>
      )}
    </form>
  );
}
