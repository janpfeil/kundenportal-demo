"use client";

import { Button } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/i18n";
import { zonePath } from "@/lib/zone";

type System = "utility" | "telco";
type Feedback = { tone: "success" | "error"; text: string } | undefined;

const SYSTEMS: readonly System[] = ["utility", "telco"];

/**
 * J7: starts the bulk import of the inactive accounts of one legacy system. Sits in the
 * card's heading row; a system with a running import is disabled and described by the hint
 * below the heading (`hintId`).
 */
export function BulkStart({
  texts,
  running = [],
  hintId,
}: {
  texts: Pick<Dictionary, "bulk" | "systems">;
  running?: readonly System[];
  hintId?: string | undefined;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();

  async function start(system: System) {
    setBusy(true);
    const result = await sendJson("POST", zonePath("/api/bulk"), { system }).catch(() => ({
      ok: false,
      status: 0,
    }));
    setBusy(false);
    if (result.ok) {
      setFeedback({ tone: "success", text: texts.bulk.started });
      router.refresh();
    } else {
      setFeedback({
        tone: "error",
        text: result.status === 409 ? texts.bulk.running : texts.bulk.failed,
      });
    }
  }

  return (
    <div className="cockpit-bulk" data-testid="bulk-start">
      <div className="cockpit-row">
        {SYSTEMS.map((system, index) => {
          const isRunning = running.includes(system);
          return (
            <Button
              key={system}
              variant={index === 0 ? "primary" : "secondary"}
              size="small"
              disabled={busy || isRunning}
              aria-describedby={isRunning ? hintId : undefined}
              onClick={() => start(system)}
              data-system={system}
            >
              {fill(texts.bulk.start, { system: texts.systems[system] })}
            </Button>
          );
        })}
      </div>
      {feedback && (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={`cockpit-feedback cockpit-feedback-${feedback.tone}`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
