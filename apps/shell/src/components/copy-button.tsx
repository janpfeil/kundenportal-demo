"use client";

import { Button, Icon } from "@kundenportal/ui";
import { useState } from "react";

/**
 * Copies a value to the clipboard. The result is announced in a polite live region next to
 * the button; the value itself stays visible, so copying by hand always works.
 */
export function CopyButton({
  value,
  label,
  texts,
}: {
  value: string;
  /** Accessible name, e.g. "Demo-Passwort kopieren". */
  label: string;
  texts: { copy: string; copied: string; copyFailed: string };
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="copy">
      <Button variant="secondary" onClick={copy} aria-label={label}>
        <Icon name="copy" />
        {texts.copy}
      </Button>
      <span role="status" className="kp-muted">
        {state === "copied" ? texts.copied : state === "failed" ? texts.copyFailed : ""}
      </span>
    </span>
  );
}
