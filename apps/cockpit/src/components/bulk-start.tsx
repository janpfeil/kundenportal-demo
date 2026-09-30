"use client";

import { Button, Notice } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/i18n";
import { fill, zonePath } from "@/lib/zone";

type Feedback = { tone: "success" | "error"; text: string } | undefined;

/** J7: starts the bulk import of the inactive accounts of one legacy system. */
export function BulkStart({ texts }: { texts: Pick<Dictionary, "bulk" | "systems"> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();

  async function start(system: "utility" | "telco") {
    setBusy(true);
    const result = await sendJson("POST", zonePath("/api/bulk"), { system });
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
    <div className="cockpit-actions" data-testid="bulk-start">
      {(["telco", "utility"] as const).map((system) => (
        <Button
          key={system}
          variant={system === "telco" ? "primary" : "secondary"}
          disabled={busy}
          onClick={() => start(system)}
          data-system={system}
        >
          {fill(texts.bulk.start, { system: texts.systems[system] })}
        </Button>
      ))}
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
    </div>
  );
}
