"use client";

import { Button, Notice, TextField } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { Dictionary } from "@/i18n";
import { zonePath } from "@/lib/zone";

/** Corrections the form offers for the fields a failed record lacks. */
const CORRECTABLE = ["postalCode", "email"] as const;

/** Redrive of one failed record, with a correction for each field that is missing. */
export function RedriveForm({
  recordId,
  fields,
  texts,
}: {
  recordId: string;
  fields: string[];
  texts: Dictionary["deadLetters"];
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
    );
    setState(result.ok ? "queued" : "failed");
    if (result.ok) router.refresh();
  }

  return (
    <form className="cockpit-redrive" onSubmit={submit} data-testid="redrive-form">
      {correctable.includes("postalCode") && (
        <TextField
          name="postalCode"
          label={texts.postalCode}
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
        />
      )}
      {correctable.includes("email") && (
        <TextField name="email" type="email" label={texts.email} maxLength={254} />
      )}
      <Button type="submit" variant="secondary" disabled={state === "busy" || state === "queued"}>
        {texts.redrive}
      </Button>
      {state === "queued" && <Notice tone="success">{texts.queued}</Notice>}
      {state === "failed" && <Notice tone="error">{texts.failed}</Notice>}
    </form>
  );
}
