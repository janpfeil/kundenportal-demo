"use client";

import { Button, Icon, Notice, TextField } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { Dictionary } from "@/i18n";
import { zonePath } from "@/lib/zone";

/** Corrections the form offers for the fields a failed record lacks. */
const CORRECTABLE = ["postalCode", "email"] as const;

/**
 * Redrive of one failed record, with a correction for each field that is missing: the
 * inline row below a dead letter. `legend` names the record for screen readers (and makes
 * the row findable by its account).
 */
export function RedriveForm({
  recordId,
  fields,
  texts,
  legend,
}: {
  recordId: string;
  fields: readonly string[];
  texts: Dictionary["deadLetters"];
  legend?: string | undefined;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "queued" | "failed">("idle");
  const correctable = CORRECTABLE.filter((field) => fields.includes(field));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const corrections = Object.fromEntries(
      correctable
        .map((field) => [field, String(form.get(field) ?? "").trim()] as const)
        .filter(([, value]) => value !== ""),
    );
    setState("busy");
    const result = await sendJson(
      "POST",
      zonePath(`/api/dlq/${encodeURIComponent(recordId)}/redrive`),
      { corrections },
    ).catch(() => ({ ok: false }));
    setState(result.ok ? "queued" : "failed");
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={submit} data-testid="redrive-form">
      <fieldset className="cockpit-redrive">
        {legend && <legend className="kp-sr-only">{legend}</legend>}
        {correctable.includes("postalCode") && (
          <TextField
            name="postalCode"
            label={texts.postalCode}
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            autoComplete="off"
          />
        )}
        {correctable.includes("email") && (
          <TextField
            name="email"
            type="email"
            label={texts.email}
            maxLength={254}
            autoComplete="off"
          />
        )}
        {correctable.length === 0 && <p className="kp-muted cockpit-small">{texts.noCorrection}</p>}
        <div>
          <Button type="submit" disabled={state === "busy" || state === "queued"}>
            <Icon name="refresh" />
            {texts.redrive}
          </Button>
        </div>
      </fieldset>
      {state === "queued" && <Notice tone="success">{texts.queued}</Notice>}
      {state === "failed" && <Notice tone="error">{texts.failed}</Notice>}
    </form>
  );
}
