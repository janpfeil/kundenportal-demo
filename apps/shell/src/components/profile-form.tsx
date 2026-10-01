"use client";

import { Button, Notice, Select, TextField } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export interface ProfileFormTexts {
  heading: string;
  name: string;
  locale: string;
  save: string;
  saved: string;
  failed: string;
}

/** Edits display name and language; writes go through sendJson (x-amz-content-sha256). */
export function ProfileForm({
  displayName,
  locale,
  texts,
}: {
  displayName: string;
  locale: "de" | "en";
  texts: ProfileFormTexts;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("saving");
    const result = await sendJson("PATCH", "/konto/profil", {
      displayName: String(form.get("displayName") ?? ""),
      locale: String(form.get("locale") ?? locale),
    });
    setState(result.ok ? "saved" : "failed");
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={submit} data-testid="profile-form" aria-labelledby="profile-heading">
      {/* Inside the card "Mein Konto" (h2). */}
      <h3 id="profile-heading">{texts.heading}</h3>
      <TextField
        name="displayName"
        label={texts.name}
        defaultValue={displayName}
        required
        maxLength={100}
      />
      <Select
        name="locale"
        label={texts.locale}
        defaultValue={locale}
        options={[
          { value: "de", label: "Deutsch" },
          { value: "en", label: "English" },
        ]}
      />
      <Button type="submit" disabled={state === "saving"}>
        {texts.save}
      </Button>
      {state === "saved" && <Notice tone="success">{texts.saved}</Notice>}
      {state === "failed" && <Notice tone="error">{texts.failed}</Notice>}
    </form>
  );
}
