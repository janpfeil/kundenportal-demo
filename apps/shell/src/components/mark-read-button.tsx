"use client";

import { Button, Icon } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Marks one message as read; the bell picks up the new count on its next refresh. */
export function MarkReadButton({
  notificationId,
  label,
}: {
  notificationId: string;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const result = await sendJson(
          "POST",
          `/postfach/${encodeURIComponent(notificationId)}/gelesen`,
          {},
        );
        setBusy(false);
        if (result.ok) router.refresh();
      }}
    >
      <Icon name="check" />
      {label}
    </Button>
  );
}
