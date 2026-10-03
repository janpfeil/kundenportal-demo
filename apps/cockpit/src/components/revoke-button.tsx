"use client";

import { Button, Icon } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/i18n";
import { zonePath } from "@/lib/zone";

type State = "idle" | "confirm" | "busy" | "done" | "failed";

/**
 * Revokes a demo pass: a small danger icon button in the table row (named after the pass
 * holder's address), then a second click as confirmation (no browser dialog).
 */
export function RevokeButton({
  passId,
  email,
  texts,
}: {
  passId: string;
  email: string;
  texts: Dictionary["passes"]["revoke"];
}) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");

  async function revoke() {
    setState("busy");
    const result = await sendJson(
      "POST",
      zonePath(`/api/passes/${encodeURIComponent(passId)}/revoke`),
      {},
    ).catch(() => ({ ok: false }));
    setState(result.ok ? "done" : "failed");
    if (result.ok) router.refresh();
  }

  return (
    <div className="cockpit-revoke" data-testid="revoke" data-pass={passId}>
      {state === "confirm" || state === "busy" ? (
        <>
          <Button variant="danger-solid" size="small" disabled={state === "busy"} onClick={revoke}>
            {texts.confirm}
          </Button>
          <Button
            variant="secondary"
            size="small"
            disabled={state === "busy"}
            onClick={() => setState("idle")}
          >
            {texts.cancel}
          </Button>
        </>
      ) : state !== "done" ? (
        <Button
          variant="danger"
          size="small"
          icon
          aria-label={fill(texts.startLabel, { email })}
          title={texts.start}
          onClick={() => setState("confirm")}
        >
          <Icon name="x" />
        </Button>
      ) : null}
      {state === "done" && (
        <p role="status" className="cockpit-feedback cockpit-feedback-success">
          {texts.done}
        </p>
      )}
      {state === "failed" && (
        <p role="alert" className="cockpit-feedback cockpit-feedback-error">
          {texts.failed}
        </p>
      )}
    </div>
  );
}
