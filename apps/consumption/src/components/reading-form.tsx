"use client";

import type { MeterReading, MeterUnit, Problem } from "@kundenportal/api-contract";
import {
  Button,
  Icon,
  Notice,
  NumberField,
  TextField,
  formatDate,
  formatQuantity,
} from "@kundenportal/ui";
import type { Locale } from "@kundenportal/ui/i18n";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import type { Dictionary } from "@/i18n";
import { isImplausible, unitLabel as unitText } from "@/lib/consumption";
import { type ReadingField, checkReading, readingProblem } from "@/lib/reading";
import { fill } from "@kundenportal/ui/i18n";
import { zonePath } from "@/lib/zone";

export type ReadingTexts = Dictionary["reading"];

export interface ReadingFormProps {
  contractId: string;
  unit: MeterUnit;
  /** Latest reading; the new one must not be below it (value and date). */
  latest?: { value: number; readAt: string } | undefined;
  /** Today in German time (`YYYY-MM-DD`), default and upper bound of the date. */
  today: string;
  /**
   * Range the API expects a reading taken on `at` to lie in; outside it the form warns while
   * typing, but still sends (the server decides).
   */
  plausibleRange?: { min: number; max: number; at: string } | undefined;
  locale: Locale;
  texts: ReadingTexts;
  loginHref: string;
}

type Feedback = { tone: "success" | "error"; text: string; login?: boolean };

/** J4: submit a meter reading; the confirmation arrives in the mailbox. */
export function ReadingForm({
  contractId,
  unit,
  latest,
  today,
  plausibleRange,
  locale,
  texts,
  loginHref,
}: ReadingFormProps) {
  const router = useRouter();
  const ids = { value: useId(), readAt: useId() };
  const latestId = useId();
  const warningId = useId();
  const [value, setValue] = useState("");
  const [readAt, setReadAt] = useState(today);
  const [errors, setErrors] = useState<Partial<Record<ReadingField, string>>>({});
  const [feedback, setFeedback] = useState<Feedback>();
  const [busy, setBusy] = useState(false);

  const quantity = (amount: number) => formatQuantity(amount, unit, locale);
  const date = (iso: string) => formatDate(iso, locale);
  const unitLabel = unitText(unit);
  const implausible = isImplausible(value, readAt, plausibleRange);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    const checked = checkReading(value, readAt, today, latest);
    if (!checked.ok) {
      const key =
        `error${checked.reason[0]?.toUpperCase()}${checked.reason.slice(1)}` as keyof ReadingTexts;
      const text = fill(texts[key], {
        value: latest ? quantity(latest.value) : "",
        date: latest ? date(latest.readAt) : "",
      });
      setErrors({ [checked.field]: text });
      document.getElementById(ids[checked.field])?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await sendJson<MeterReading | Problem>(
        "POST",
        zonePath(`/api/contracts/${encodeURIComponent(contractId)}/readings`),
        checked.reading,
      );
      if (result.ok && result.data && "readingId" in result.data) {
        setFeedback({
          tone: "success",
          text: fill(texts.success, { value: quantity(result.data.value) }),
        });
        setValue("");
        router.refresh();
        return;
      }
      const detail = result.data && "detail" in result.data ? result.data.detail : undefined;
      const problem = readingProblem(result.status, detail);
      const messages: Record<typeof problem.kind, string> = {
        session: texts.errorSession,
        future: texts.errorDateFuture,
        noMeter: texts.errorNoMeter,
        inactive: texts.errorInactive,
        implausible: texts.errorImplausible,
        generic: texts.errorGeneric,
        dateBefore: fill(texts.errorDateBefore, {
          date: "date" in problem ? date(problem.date) : "",
        }),
        valueBelow: fill(texts.errorValueBelow, {
          value: "value" in problem ? quantity(problem.value) : "",
        }),
      };
      setFeedback({
        tone: "error",
        text: messages[problem.kind],
        login: problem.kind === "session",
      });
    } catch {
      setFeedback({ tone: "error", text: texts.errorGeneric });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="zone-form" onSubmit={submit} noValidate data-testid="reading-form">
      {latest && (
        <p className="kp-muted zone-small" id={latestId}>
          {fill(texts.latest, { value: quantity(latest.value), date: date(latest.readAt) })}
        </p>
      )}
      <div className="zone-field-group">
        <NumberField
          id={ids.value}
          label={texts.value}
          unit={unitLabel}
          error={errors.value}
          name="value"
          min={latest?.value ?? 0}
          step="any"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby={
            [latest && latestId, implausible && warningId].filter(Boolean).join(" ") || undefined
          }
          required
        />
        {/* A live region without a role: it speaks up while typing but is no status message. */}
        <div aria-live="polite" className="zone-live">
          {implausible && plausibleRange && (
            <p className="zone-warning" id={warningId}>
              <Icon name="alert" />
              <span>
                {texts.errorImplausible}{" "}
                {fill(texts.expected, {
                  min: quantity(plausibleRange.min),
                  max: quantity(plausibleRange.max),
                })}
              </span>
            </p>
          )}
        </div>
      </div>
      <TextField
        id={ids.readAt}
        label={texts.readAt}
        type="date"
        error={errors.readAt}
        name="readAt"
        max={today}
        min={latest?.readAt}
        value={readAt}
        onChange={(event) => setReadAt(event.target.value)}
        required
      />
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? texts.busy : texts.submit}
        </Button>
      </div>
      {feedback && (
        <Notice tone={feedback.tone}>
          <p>{feedback.text}</p>
          {feedback.login && (
            <p>
              <a href={loginHref}>{texts.login}</a>
            </p>
          )}
        </Notice>
      )}
    </form>
  );
}
