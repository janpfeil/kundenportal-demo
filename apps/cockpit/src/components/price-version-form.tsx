"use client";

import { Button, Notice, TextField } from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { Dictionary } from "@/i18n";
import { failureText } from "@/lib/feedback";
import { centInput, euroInput } from "@/lib/money";
import {
  EMPTY_OPTION,
  type FieldErrors,
  type OptionDraft,
  type Product,
  optionFields,
  validatePriceDraft,
} from "@/lib/products";
import { zonePath } from "@/lib/zone";
import { unitOf } from "./product-form";

type Texts = Dictionary["products"];

/**
 * "Neue Preisversion": a date from today on and the new prices of every option (base or
 * monthly price, work price for metered divisions), prefilled with the current ones.
 */
export function PriceVersionForm({
  product,
  texts,
  today,
  locale,
}: {
  product: Pick<Product, "productId" | "division" | "options">;
  texts: Texts;
  today: string;
  locale: Locale;
}) {
  const router = useRouter();
  const p = texts.priceForm;
  const work = optionFields(product.division).work;
  const initial = () =>
    product.options.map((option): OptionDraft => ({
      ...EMPTY_OPTION,
      monthly: euroInput(option.monthlyPriceCent, locale),
      work: option.workPriceCent === undefined ? "" : centInput(option.workPriceCent, locale),
    }));
  const [validFrom, setValidFrom] = useState(today);
  const [rows, setRows] = useState<OptionDraft[]>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string }>();

  const error = (key: string) => (errors[key] ? texts.fieldErrors[errors[key]] : undefined);
  const setRow = (index: number, key: "monthly" | "work", value: string) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { value, errors: found } = validatePriceDraft(
      product,
      { validFrom, options: rows },
      today,
    );
    setErrors(found);
    if (!value) {
      setFeedback({ tone: "error", text: texts.form.check });
      return;
    }
    setBusy(true);
    setFeedback(undefined);
    const result = await sendJson<{ version?: number }>(
      "POST",
      zonePath(`/api/products/${encodeURIComponent(product.productId)}/versions`),
      value,
    ).catch(() => ({ ok: false, status: 0, data: undefined }));
    setBusy(false);
    if (!result.ok) {
      setFeedback({ tone: "error", text: failureText(result.status, texts.errors) });
      return;
    }
    setFeedback({
      tone: "success",
      text: fill(p.done, { version: result.data?.version ?? "" }),
    });
    router.refresh();
  }

  return (
    <form
      className="cockpit-product-form"
      onSubmit={submit}
      noValidate
      data-testid="price-version-form"
    >
      <p className="kp-muted cockpit-small">{p.intro}</p>
      <TextField
        type="date"
        label={p.validFrom}
        hint={p.validFromHint}
        name="validFrom"
        min={today}
        value={validFrom}
        onChange={(event) => setValidFrom(event.target.value)}
        error={error("validFrom")}
      />
      {product.options.map((option, index) => (
        <fieldset key={option.optionId} className="cockpit-option-row" data-testid="price-row">
          <legend className="cockpit-option-legend">{option.label}</legend>
          <TextField
            label={texts.form.monthly}
            name={`options.${index}.monthly`}
            inputMode="decimal"
            value={rows[index]?.monthly ?? ""}
            onChange={(event) => setRow(index, "monthly", event.target.value)}
            error={error(`options.${index}.monthly`)}
          />
          {work && (
            <TextField
              label={fill(texts.form.work, { unit: unitOf(product.division) })}
              name={`options.${index}.work`}
              inputMode="decimal"
              value={rows[index]?.work ?? ""}
              onChange={(event) => setRow(index, "work", event.target.value)}
              error={error(`options.${index}.work`)}
            />
          )}
        </fieldset>
      ))}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? texts.form.sending : p.submit}
        </Button>
      </div>
      {feedback && (
        <Notice tone={feedback.tone} data-testid="price-version-feedback">
          {feedback.text}
        </Notice>
      )}
    </form>
  );
}
