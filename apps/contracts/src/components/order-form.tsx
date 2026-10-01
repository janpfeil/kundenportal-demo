"use client";

import type { Contract, Problem } from "@kundenportal/api-contract";
import {
  Button,
  ButtonLink,
  Card,
  Facts,
  Notice,
  NumberField,
  Split,
  TextField,
  formatDate,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import { sendJson } from "@kundenportal/web-auth/browser";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { Dictionary } from "@/i18n";
import { unitLabel } from "@/lib/format";
import {
  type OrderApiProblem,
  type OrderField,
  type OrderInput,
  type OrderProblem,
  checkOrder,
  latestStart,
  orderProblem,
} from "@/lib/order";
import { METERED, type Product, meterUnit, monthsText, optionPrice } from "@/lib/products";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export interface OrderFormProps {
  product: Product;
  /** The option chosen in the catalogue (`?option=`). */
  initialOption: string;
  /** Today in German time (`YYYY-MM-DD`), from the server. */
  today: string;
  locale: Locale;
  t: Pick<Dictionary, "order" | "prices" | "catalogue">;
  loginHref: string;
}

const FIELD_ORDER: readonly OrderField[] = [
  "optionId",
  "startDate",
  "meterNumber",
  "startReading",
  "consent",
];

const PROBLEM_TEXT: Record<OrderProblem, keyof Dictionary["order"]> = {
  option: "errorOption",
  dateEmpty: "errorDateEmpty",
  dateRange: "errorDateRange",
  meterEmpty: "errorMeterEmpty",
  meterFormat: "errorMeterFormat",
  readingEmpty: "errorReadingEmpty",
  readingFormat: "errorReadingFormat",
  consent: "errorConsent",
};

const API_TEXT: Record<OrderApiProblem, keyof Dictionary["order"]> = {
  session: "errorSession",
  unavailable: "errorUnavailable",
  conflict: "errorConflict",
  invalid: "errorInvalid",
  generic: "errorGeneric",
};

/**
 * Ordering a product: the option as radio cards, start date, for metered divisions meter
 * number and reading at the start, the consent and "Kostenpflichtig bestellen"; next to it
 * a summary that follows the chosen option. After the order a confirmation with a link to
 * the new contract replaces the form.
 */
export function OrderForm({ product, initialOption, today, locale, t, loginHref }: OrderFormProps) {
  const texts = t.order;
  const baseId = useId();
  const fieldId = (field: OrderField) => `${baseId}-${field}`;
  const [input, setInput] = useState<OrderInput>({
    optionId: initialOption,
    startDate: today,
    meterNumber: "",
    startReading: "",
    consent: false,
  });
  const [errors, setErrors] = useState<Partial<Record<OrderField, OrderProblem>>>({});
  const [failure, setFailure] = useState<OrderApiProblem>();
  const [busy, setBusy] = useState(false);
  const [concluded, setConcluded] = useState<Contract>();
  const confirmation = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (concluded) confirmation.current?.focus();
  }, [concluded]);

  const metered = METERED.has(product.division);
  const unit = unitLabel(meterUnit(product));
  const latest = latestStart(today);
  const range = { from: formatDate(today, locale), to: formatDate(latest, locale) };
  const option = product.options.find((entry) => entry.optionId === input.optionId);
  const price = option ? optionPrice(option, product, locale, t.prices) : undefined;
  const message = (field: OrderField) => {
    const problem = errors[field];
    return problem === undefined ? undefined : fill(texts[PROBLEM_TEXT[problem]], range);
  };
  const set = <K extends OrderField>(field: K, value: OrderInput[K]) => {
    setInput((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => {
      const { [field]: _removed, ...rest } = previous;
      return rest;
    });
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(undefined);
    const check = checkOrder(input, product, today);
    if (!check.ok) {
      setErrors(check.errors);
      const first = FIELD_ORDER.find((field) => check.errors[field] !== undefined);
      if (first === "optionId") document.getElementsByName(`${baseId}-option`)[0]?.focus();
      else if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await sendJson<Contract | Problem>(
        "POST",
        zonePath("/api/contracts"),
        check.order,
      );
      if (result.ok && result.data && "contractId" in result.data) {
        setConcluded(result.data);
        return;
      }
      setFailure(orderProblem(result.status));
    } catch {
      setFailure("generic");
    } finally {
      setBusy(false);
    }
  }

  const summary = (
    <Card as="section" title={texts.summary} className="zone-summary">
      <Facts
        className="zone-facts-plain"
        items={[
          { term: texts.product, description: product.name },
          ...(option && price
            ? [
                { term: texts.option, description: option.label },
                { term: price.amountLabel, description: price.amount, id: "amount" },
                ...price.lines.map((line) => ({ term: line.term, description: line.value })),
              ]
            : []),
          {
            term: texts.terms,
            description: fill(texts.termsValue, {
              term: monthsText(product.minimumTermMonths, t.catalogue),
              notice: monthsText(product.noticePeriodMonths, t.catalogue),
            }),
          },
        ]}
      />
      <p className="kp-muted zone-small">{texts.withdrawalHint}</p>
    </Card>
  );

  if (concluded) {
    const label =
      product.options.find((entry) => entry.optionId === concluded.tariffOption)?.label ??
      concluded.tariffOption;
    return (
      <div ref={confirmation} tabIndex={-1} className="zone-confirmation">
        <Notice tone="success" title={texts.successTitle} data-testid="order-confirmation">
          <p>
            {fill(texts.successText, {
              tariff: concluded.tariffName,
              option: label,
              start: formatDate(concluded.startDate, locale),
            })}
          </p>
          {concluded.withdrawableUntil && (
            <p>
              {fill(texts.successWithdrawal, {
                date: formatDate(concluded.withdrawableUntil, locale),
              })}
            </p>
          )}
          <p>
            <ButtonLink
              href={zonePath(`/${encodeURIComponent(concluded.contractId)}`)}
              linkComponent={ZoneLink}
            >
              {texts.toContract}
            </ButtonLink>
          </p>
        </Notice>
      </div>
    );
  }

  return (
    <Split>
      <Card as="section" title={texts.formTitle}>
        <form className="zone-form" onSubmit={submit} noValidate data-testid="order-form">
          <fieldset
            className="zone-optcards"
            aria-describedby={errors.optionId ? fieldId("optionId") : undefined}
          >
            <legend>{texts.optionLegend}</legend>
            {product.options.map((entry) => {
              const entryPrice = optionPrice(entry, product, locale, t.prices);
              return (
                <label key={entry.optionId} className="zone-optcard">
                  <input
                    type="radio"
                    name={`${baseId}-option`}
                    value={entry.optionId}
                    checked={input.optionId === entry.optionId}
                    onChange={() => set("optionId", entry.optionId)}
                  />
                  <b>{entry.label}</b>
                  <small>
                    {entryPrice.amount} {entryPrice.amountLabel}
                  </small>
                  {entryPrice.lines.map((line) => (
                    <small key={line.term}>
                      {line.term} {line.value}
                    </small>
                  ))}
                </label>
              );
            })}
            {errors.optionId && (
              <span className="kp-error" id={fieldId("optionId")}>
                {message("optionId")}
              </span>
            )}
          </fieldset>
          <TextField
            id={fieldId("startDate")}
            type="date"
            label={texts.startDate}
            hint={fill(texts.startHint, range)}
            error={message("startDate")}
            min={today}
            max={latest}
            value={input.startDate}
            onChange={(event) => set("startDate", event.target.value)}
            required
          />
          {metered && (
            <>
              <TextField
                id={fieldId("meterNumber")}
                label={texts.meterNumber}
                hint={texts.meterHint}
                error={message("meterNumber")}
                autoComplete="off"
                spellCheck={false}
                maxLength={30}
                value={input.meterNumber}
                onChange={(event) => set("meterNumber", event.target.value)}
                required
              />
              <NumberField
                id={fieldId("startReading")}
                label={texts.startReading}
                hint={texts.readingHint}
                error={message("startReading")}
                unit={unit}
                min={0}
                step="any"
                value={input.startReading}
                onChange={(event) => set("startReading", event.target.value)}
                required
              />
            </>
          )}
          <div className="kp-field">
            <label className="zone-check">
              <input
                id={fieldId("consent")}
                type="checkbox"
                checked={input.consent}
                onChange={(event) => set("consent", event.target.checked)}
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={errors.consent ? `${fieldId("consent")}-error` : undefined}
                required
              />
              <span>{texts.consent}</span>
            </label>
            {errors.consent && (
              <span className="kp-error" id={`${fieldId("consent")}-error`}>
                {message("consent")}
              </span>
            )}
          </div>
          {failure && (
            <Notice tone="error" className="zone-feedback">
              <p>{texts[API_TEXT[failure]]}</p>
              {failure === "session" && (
                <p>
                  <a href={loginHref}>{texts.login}</a>
                </p>
              )}
            </Notice>
          )}
          <div className="zone-buttons">
            <Button type="submit" disabled={busy}>
              {busy ? texts.busy : texts.submit}
            </Button>
          </div>
        </form>
      </Card>
      {summary}
    </Split>
  );
}
