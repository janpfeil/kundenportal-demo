"use client";

import { Button, Icon, Notice, Select, TextField } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { Dictionary } from "@/i18n";
import { failureText } from "@/lib/feedback";
import { DIVISIONS, type Division } from "@/lib/filters";
import {
  EMPTY_OPTION,
  type FieldErrors,
  MAX_OPTIONS,
  type OptionDraft,
  type ProductDraft,
  optionFields,
  validateProductDraft,
} from "@/lib/products";
import { zonePath } from "@/lib/zone";

type Texts = Dictionary["products"];

/** The unit of a metered division's work price. */
export const unitOf = (division: Division) => (division === "electricity" ? "kWh" : "m³");

/** A multi-line text field styled like the library's fields. */
export function TextArea({
  label,
  hint,
  value,
  onChange,
  error,
  name,
  maxLength,
}: {
  label: string;
  hint?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  name: string;
  maxLength: number;
}) {
  const id = `product-${name}`;
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="kp-field">
      <label className="kp-label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="kp-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      <textarea
        id={id}
        name={name}
        className="kp-input cockpit-textarea"
        rows={3}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
      />
      {error && (
        <span className="kp-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * "Produkt anlegen": id, division, name, description, terms and one to six options with
 * their prices (fields follow the division: work price for metered ones, data volume for
 * mobile, bandwidth for internet). Checked here per field, again by the zone and the API.
 * A created product opens on its own page.
 */
export function ProductForm({
  texts,
  divisions,
  today,
}: {
  texts: Texts;
  divisions: Dictionary["operator"]["divisions"];
  today: string;
}) {
  const router = useRouter();
  const f = texts.form;
  const [draft, setDraft] = useState<ProductDraft>({
    productId: "",
    division: "",
    name: "",
    description: "",
    minimumTermMonths: "12",
    noticePeriodMonths: "1",
    validFrom: "",
    options: [{ ...EMPTY_OPTION }],
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const division = (DIVISIONS as readonly string[]).includes(draft.division)
    ? (draft.division as Division)
    : undefined;
  const fields = division
    ? optionFields(division)
    : { work: false, volume: false, bandwidth: false };
  const error = (key: string) => {
    const code = errors[key];
    return code ? texts.fieldErrors[code] : undefined;
  };
  const set = (key: keyof Omit<ProductDraft, "options">) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setOption = (index: number, key: keyof OptionDraft, value: string) =>
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, i) =>
        i === index ? { ...option, [key]: value } : option,
      ),
    }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { value, errors: found } = validateProductDraft(draft, today);
    setErrors(found);
    setProblem(value ? undefined : f.check);
    if (!value) return;
    setBusy(true);
    const result = await sendJson("POST", zonePath("/api/products"), value).catch(() => ({
      ok: false,
      status: 0,
    }));
    setBusy(false);
    if (!result.ok) {
      setProblem(failureText(result.status, texts.errors));
      return;
    }
    // next/navigation adds the basePath itself.
    router.push(`/produkte/${encodeURIComponent(value.productId)}`);
  }

  return (
    <form className="cockpit-product-form" onSubmit={submit} noValidate data-testid="product-form">
      <div className="cockpit-form-grid">
        <TextField
          label={f.id}
          hint={f.idHint}
          name="productId"
          value={draft.productId}
          onChange={(event) => set("productId")(event.target.value)}
          error={error("productId")}
          autoComplete="off"
          maxLength={40}
          required
        />
        <Select
          label={f.division}
          name="division"
          value={draft.division}
          onChange={(event) => set("division")(event.target.value)}
          placeholder={f.choose}
          options={DIVISIONS.map((value) => ({ value, label: divisions[value] }))}
          error={error("division")}
          required
        />
        <TextField
          label={f.name}
          name="name"
          value={draft.name}
          onChange={(event) => set("name")(event.target.value)}
          error={error("name")}
          maxLength={60}
          required
        />
        <TextField
          type="date"
          label={f.validFrom}
          hint={f.validFromHint}
          name="validFrom"
          min={today}
          value={draft.validFrom}
          onChange={(event) => set("validFrom")(event.target.value)}
          error={error("validFrom")}
        />
        <TextField
          label={f.term}
          name="minimumTermMonths"
          inputMode="numeric"
          value={draft.minimumTermMonths}
          onChange={(event) => set("minimumTermMonths")(event.target.value)}
          error={error("minimumTermMonths")}
        />
        <TextField
          label={f.notice}
          name="noticePeriodMonths"
          inputMode="numeric"
          value={draft.noticePeriodMonths}
          onChange={(event) => set("noticePeriodMonths")(event.target.value)}
          error={error("noticePeriodMonths")}
        />
      </div>
      <TextArea
        label={f.description}
        hint={texts.edit.descriptionHint}
        name="description"
        maxLength={400}
        value={draft.description}
        onChange={set("description")}
        error={error("description")}
      />
      <fieldset className="cockpit-fieldset">
        <legend className="kp-label">{f.options}</legend>
        <p className="kp-hint">{f.optionsHint}</p>
        {draft.options.map((option, index) => {
          const number = index + 1;
          const key = (field: string) => `options.${index}.${field}`;
          return (
            <fieldset key={index} className="cockpit-option-row" data-testid="option-row">
              <legend className="cockpit-option-legend">{fill(f.option, { number })}</legend>
              <TextField
                label={f.optionId}
                name={key("optionId")}
                value={option.optionId}
                onChange={(event) => setOption(index, "optionId", event.target.value)}
                error={error(key("optionId"))}
                autoComplete="off"
                maxLength={40}
              />
              <TextField
                label={f.optionLabel}
                name={key("label")}
                value={option.label}
                onChange={(event) => setOption(index, "label", event.target.value)}
                error={error(key("label"))}
                maxLength={60}
              />
              <TextField
                label={f.monthly}
                name={key("monthly")}
                inputMode="decimal"
                value={option.monthly}
                onChange={(event) => setOption(index, "monthly", event.target.value)}
                error={error(key("monthly"))}
              />
              {fields.work && division && (
                <TextField
                  label={fill(f.work, { unit: unitOf(division) })}
                  name={key("work")}
                  inputMode="decimal"
                  value={option.work}
                  onChange={(event) => setOption(index, "work", event.target.value)}
                  error={error(key("work"))}
                />
              )}
              {fields.volume && (
                <TextField
                  label={f.volume}
                  name={key("volume")}
                  inputMode="numeric"
                  value={option.volume}
                  onChange={(event) => setOption(index, "volume", event.target.value)}
                  error={error(key("volume"))}
                />
              )}
              {fields.bandwidth && (
                <TextField
                  label={f.bandwidth}
                  name={key("bandwidth")}
                  inputMode="numeric"
                  value={option.bandwidth}
                  onChange={(event) => setOption(index, "bandwidth", event.target.value)}
                  error={error(key("bandwidth"))}
                />
              )}
              {draft.options.length > 1 && (
                <div className="cockpit-option-remove">
                  <Button
                    variant="secondary"
                    className="cockpit-button-small cockpit-button-ghost"
                    aria-label={fill(f.removeOption, { number })}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        options: current.options.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Icon name="x" />
                  </Button>
                </div>
              )}
            </fieldset>
          );
        })}
        {draft.options.length < MAX_OPTIONS && (
          <Button
            variant="secondary"
            className="cockpit-button-small"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                options: [...current.options, { ...EMPTY_OPTION }],
              }))
            }
          >
            <Icon name="plus" />
            {f.addOption}
          </Button>
        )}
      </fieldset>
      {problem && (
        <Notice tone="error" data-testid="product-form-problem">
          {problem}
        </Notice>
      )}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? f.sending : f.submit}
        </Button>
      </div>
    </form>
  );
}
