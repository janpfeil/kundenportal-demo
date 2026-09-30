"use client";

import { Badge, Button, Facts, Notice, Select, formatDateTime } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { sendJson } from "@kundenportal/web-auth/browser";
import { type FormEvent, useState } from "react";
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
 * The owner's switches for demo passes: close or reopen redemption (the budget alarm
 * closes it by itself; the reason is shown) and the cap of concurrent pass tenants.
 * Writes go through sendJson (x-amz-content-sha256) to the zone's PUT /api/settings; the
 * panel then shows the settings the API answered with.
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
  }

  function saveCap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void update({ maxTenants: cap });
  }

  return (
    <div data-testid="tenancy-settings" data-redemption={settings.redemption}>
      <Facts
        items={[
          {
            term: texts.redemption,
            description: (
              <Badge tone={closed ? "warning" : "success"}>
                {closed ? texts.closed : texts.open}
              </Badge>
            ),
          },
          ...(closed
            ? [
                ...(settings.closedAt
                  ? [
                      {
                        term: texts.closedAt,
                        description: formatDateTime(settings.closedAt, locale, "medium"),
                      },
                    ]
                  : []),
                {
                  term: texts.reason,
                  description: (
                    <span data-testid="closed-reason">
                      {settings.closedReason ?? texts.noReason}
                    </span>
                  ),
                },
              ]
            : []),
          {
            term: texts.active,
            description: (
              <span data-testid="active-tenants">
                {fill(texts.activeText, {
                  active: settings.activeTenants,
                  max: settings.maxTenants,
                })}
              </span>
            ),
          },
        ]}
      />
      {full && <Notice tone="info">{texts.full}</Notice>}
      <p className="kp-muted">{texts.redemptionHint}</p>
      <div className="cockpit-actions">
        <Button
          variant={closed ? "primary" : "secondary"}
          disabled={busy}
          onClick={() => void update({ redemption: closed ? "open" : "closed" })}
          data-testid="toggle-redemption"
        >
          {busy ? texts.saving : closed ? texts.reopen : texts.close}
        </Button>
      </div>
      <form className="cockpit-settings" onSubmit={saveCap}>
        <Select
          label={texts.cap}
          hint={texts.capHint}
          name="maxTenants"
          value={String(cap)}
          onChange={(event) => setCap(Number(event.target.value))}
          options={CAPS.map((value) => ({ value: String(value), label: String(value) }))}
        />
        <div>
          <Button type="submit" variant="secondary" disabled={busy || cap === settings.maxTenants}>
            {texts.saveCap}
          </Button>
        </div>
      </form>
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
    </div>
  );
}
