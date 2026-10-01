"use client";

import { Button, Notice, Select, StatusBadge, Switch, formatDateTime } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import {
  MAX_TENANTS,
  MIN_TENANTS,
  type SettingsUpdate,
  type TenancySettings,
  parseSettings,
} from "@/lib/settings";
import { zonePath } from "@/lib/zone";

type Texts = Dictionary["passes"]["settings"];
type Feedback = { tone: "success" | "error"; text: string };

const CAPS = Array.from({ length: MAX_TENANTS - MIN_TENANTS + 1 }, (_, i) => MIN_TENANTS + i);

/**
 * The owner's switches for demo passes, as in the mockup: the switch "Einlösen" (offen /
 * gesperrt; the budget alarm closes it by itself, the reason is shown) and the cap of
 * concurrent pass tenants. Writes go through sendJson (x-amz-content-sha256) to the zone's
 * PUT /api/settings; the panel then shows what the API answered and the page refreshes its
 * key figures.
 */
export function SettingsPanel({
  settings: initial,
  texts,
  locale,
}: {
  settings: TenancySettings;
  texts: Texts;
  locale: Locale;
}) {
  const router = useRouter();
  const hintId = useId();
  const [settings, setSettings] = useState(initial);
  const [cap, setCap] = useState(initial.maxTenants);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const closed = settings.redemption === "closed";
  const full = !closed && settings.activeTenants >= settings.maxTenants;

  async function update(change: SettingsUpdate) {
    setBusy(true);
    setFeedback(undefined);
    const result = await sendJson("PUT", zonePath("/api/settings"), change).catch(() => ({
      ok: false,
      status: 0,
      data: undefined,
    }));
    setBusy(false);
    const next = result.ok ? parseSettings(result.data) : undefined;
    if (!next) {
      setFeedback({ tone: "error", text: texts.failed });
      return;
    }
    setSettings(next);
    setCap(next.maxTenants);
    setFeedback({ tone: "success", text: texts.saved });
    router.refresh();
  }

  function saveCap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void update({ maxTenants: cap });
  }

  return (
    <div
      className="cockpit-settings"
      data-testid="tenancy-settings"
      data-redemption={settings.redemption}
    >
      <div>
        <Switch
          checked={!closed}
          disabled={busy}
          aria-describedby={hintId}
          onCheckedChange={(open) => void update({ redemption: open ? "open" : "closed" })}
          status={
            <StatusBadge tone={closed ? "warn" : "ok"}>
              {closed ? texts.closed : texts.open}
            </StatusBadge>
          }
          data-testid="toggle-redemption"
        >
          {texts.redemption}
        </Switch>
      </div>
      {closed && (
        <p className="cockpit-small">
          {settings.closedAt && (
            <>
              {fill(texts.closedAt, { date: formatDateTime(settings.closedAt, locale, "medium") })}
              {" · "}
            </>
          )}
          <span data-testid="closed-reason">
            {fill(texts.reason, { reason: settings.closedReason ?? texts.noReason })}
          </span>
        </p>
      )}
      <p className="kp-muted cockpit-small" id={hintId}>
        {texts.redemptionHint}
      </p>
      {full && <Notice tone="info">{texts.full}</Notice>}
      <form className="cockpit-cap" onSubmit={saveCap}>
        <Select
          label={texts.cap}
          hint={texts.capHint}
          name="maxTenants"
          value={String(cap)}
          onChange={(event) => setCap(Number(event.target.value))}
          // A stored cap outside 1–4 (the contract allows 0) stays visible until changed.
          options={(CAPS.includes(settings.maxTenants) ? CAPS : [settings.maxTenants, ...CAPS]).map(
            (value) => ({ value: String(value), label: String(value) }),
          )}
        />
        <Button type="submit" variant="secondary" disabled={busy || cap === settings.maxTenants}>
          {busy ? texts.saving : texts.saveCap}
        </Button>
      </form>
      <p className="kp-muted cockpit-small" data-testid="active-tenants">
        {fill(texts.activeText, { active: settings.activeTenants, max: settings.maxTenants })}
      </p>
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
    </div>
  );
}
