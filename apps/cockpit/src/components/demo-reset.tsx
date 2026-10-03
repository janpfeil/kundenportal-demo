"use client";

import { Button, Notice } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/i18n";
import { fill } from "@kundenportal/ui/i18n";
import { zonePath } from "@/lib/zone";

type State = "idle" | "confirm" | "busy" | "done" | "failed";

/** Demo reset with a second click as confirmation (no browser dialog). */
export function DemoReset({ texts }: { texts: Dictionary["reset"] }) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [summary, setSummary] = useState("");

  async function reset() {
    setState("busy");
    const result = await sendJson<{ accountsRemoved: number; recordsRemoved: number }>(
      "POST",
      zonePath("/api/reset"),
      {},
    );
    if (result.ok && result.data) {
      setSummary(fill(texts.done, result.data));
      setState("done");
      router.refresh();
    } else {
      setState("failed");
    }
  }

  return (
    <div className="cockpit-actions" data-testid="demo-reset">
      {state === "confirm" ? (
        <>
          <Button variant="danger-solid" size="small" onClick={reset}>
            {texts.confirm}
          </Button>
          <Button variant="secondary" size="small" onClick={() => setState("idle")}>
            {texts.cancel}
          </Button>
        </>
      ) : (
        <Button
          variant="danger"
          size="small"
          disabled={state === "busy"}
          onClick={() => setState("confirm")}
        >
          {texts.start}
        </Button>
      )}
      {state === "done" && <Notice tone="success">{summary}</Notice>}
      {state === "failed" && <Notice tone="error">{texts.failed}</Notice>}
    </div>
  );
}
