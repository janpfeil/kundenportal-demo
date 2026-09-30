"use client";

import { Button, Notice } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/i18n";
import { zonePath } from "@/lib/zone";

type State = "idle" | "confirm" | "busy" | "done" | "failed";

/** Revokes a demo pass with a second click as confirmation (no browser dialog). */
export function RevokeButton({
  passId,
  texts,
}: {
  passId: string;
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
    <div className="cockpit-actions" data-testid="revoke" data-pass={passId}>
      {state === "confirm" ? (
        <>
          <Button variant="primary" onClick={revoke}>
            {texts.confirm}
          </Button>
          <Button variant="secondary" onClick={() => setState("idle")}>
            {texts.cancel}
          </Button>
        </>
      ) : state !== "done" ? (
        <Button variant="secondary" disabled={state === "busy"} onClick={() => setState("confirm")}>
          {texts.start}
        </Button>
      ) : null}
      {state === "done" && <Notice tone="success">{texts.done}</Notice>}
      {state === "failed" && <Notice tone="error">{texts.failed}</Notice>}
    </div>
  );
}
