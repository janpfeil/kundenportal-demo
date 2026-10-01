"use client";

import { Button, Notice, TextField } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { Dictionary } from "@/i18n";
import { failureText } from "@/lib/feedback";
import type { ProductStatus } from "@/lib/filters";
import {
  type FieldErrors,
  STATUS_TARGETS,
  type StatusMove,
  type ProductUpdate,
  parseProductUpdate,
} from "@/lib/products";
import { zonePath } from "@/lib/zone";
import { TextArea } from "./product-form";

type Texts = Dictionary["products"];
type Feedback = { tone: "success" | "error"; text: string };

/** PATCH /api/products/{id} through the zone; the API's status for the message. */
async function patch(productId: string, update: ProductUpdate) {
  return sendJson(
    "PATCH",
    zonePath(`/api/products/${encodeURIComponent(productId)}`),
    update,
  ).catch(() => ({ ok: false, status: 0 }));
}

/**
 * The status moves of a product as buttons: "Freigeben", "Auslaufen lassen", "Wieder
 * aktivieren", "Archivieren" (asks a second time; impossible while contracts run).
 */
export function ProductStatusMoves({
  productId,
  moves,
  texts,
}: {
  productId: string;
  moves: readonly StatusMove[];
  texts: Texts;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const m = texts.moves;

  async function move(status: ProductStatus) {
    setBusy(true);
    setFeedback(undefined);
    const result = await patch(productId, { status });
    setBusy(false);
    setConfirm(false);
    if (!result.ok) {
      setFeedback({ tone: "error", text: failureText(result.status, texts.errors) });
      return;
    }
    setFeedback({ tone: "success", text: fill(m.done, { status: texts.statuses[status] }) });
    router.refresh();
  }

  if (moves.length === 0) return <p className="kp-muted cockpit-small">{m.archived}</p>;
  const blocked = moves.some((entry) => entry.blocked);
  return (
    <div className="cockpit-actions" data-testid="product-status-moves">
      {confirm ? (
        <div className="cockpit-confirm" role="group" aria-label={m.confirmArchive}>
          <p className="cockpit-small">
            <strong>{m.confirmArchive}</strong>
          </p>
          <div className="cockpit-actions">
            <Button
              className="cockpit-button-small cockpit-button-danger-solid"
              disabled={busy}
              onClick={() => void move("archived")}
            >
              {m.confirm}
            </Button>
            <Button
              variant="secondary"
              className="cockpit-button-small"
              onClick={() => setConfirm(false)}
            >
              {m.cancel}
            </Button>
          </div>
        </div>
      ) : (
        moves.map(({ action, blocked: reason }) => (
          <Button
            key={action}
            variant={action === "publish" || action === "reactivate" ? "primary" : "secondary"}
            className={
              action === "archive"
                ? "cockpit-button-small cockpit-button-danger"
                : "cockpit-button-small"
            }
            disabled={busy || reason !== undefined}
            data-move={action}
            onClick={() =>
              action === "archive" ? setConfirm(true) : void move(STATUS_TARGETS[action])
            }
          >
            {m[action]}
          </Button>
        ))
      )}
      {blocked && <p className="kp-muted cockpit-small cockpit-feedback">{m.archiveBlocked}</p>}
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
    </div>
  );
}

export interface EditableProduct {
  productId: string;
  name: string;
  description: string;
  minimumTermMonths: number;
  noticePeriodMonths: number;
}

/** Texts and terms of a product; only what changed is sent. Prices change by version. */
export function ProductEditForm({ product, texts }: { product: EditableProduct; texts: Texts }) {
  const router = useRouter();
  const e = texts.edit;
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [term, setTerm] = useState(String(product.minimumTermMonths));
  const [notice, setNotice] = useState(String(product.noticePeriodMonths));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FieldErrors = {};
    const months = (text: string, max: number, key: string) => {
      const value = /^\d{1,2}$/.test(text.trim()) ? Number(text.trim()) : Number.NaN;
      if (!(value >= 0 && value <= max)) found[key] = "range";
      return value;
    };
    const update: Record<string, unknown> = {};
    if (name.trim() !== product.name) {
      if (name.trim().length < 2 || name.trim().length > 60) found.name = "length";
      update.name = name.trim();
    }
    if (description.trim() !== product.description) update.description = description.trim();
    const termValue = months(term, 36, "minimumTermMonths");
    if (termValue !== product.minimumTermMonths) update.minimumTermMonths = termValue;
    const noticeValue = months(notice, 12, "noticePeriodMonths");
    if (noticeValue !== product.noticePeriodMonths) update.noticePeriodMonths = noticeValue;
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = parseProductUpdate(update);
    if (!body) {
      setFeedback({ tone: "success", text: e.unchanged });
      return;
    }
    setBusy(true);
    setFeedback(undefined);
    const result = await patch(product.productId, body);
    setBusy(false);
    if (!result.ok) {
      setFeedback({ tone: "error", text: failureText(result.status, texts.errors) });
      return;
    }
    setFeedback({ tone: "success", text: e.saved });
    router.refresh();
  }

  const error = (key: string) => (errors[key] ? texts.fieldErrors[errors[key]] : undefined);
  return (
    <form className="cockpit-product-form" onSubmit={submit} noValidate data-testid="product-edit">
      <TextField
        label={e.name}
        name="name"
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
        error={error("name")}
      />
      <TextArea
        label={e.description}
        hint={e.descriptionHint}
        name="description"
        maxLength={400}
        value={description}
        onChange={setDescription}
      />
      <p className="kp-hint">{e.termHint}</p>
      <div className="cockpit-form-grid">
        <TextField
          label={e.term}
          name="minimumTermMonths"
          inputMode="numeric"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          error={error("minimumTermMonths")}
        />
        <TextField
          label={e.notice}
          name="noticePeriodMonths"
          inputMode="numeric"
          value={notice}
          onChange={(event) => setNotice(event.target.value)}
          error={error("noticePeriodMonths")}
        />
      </div>
      <div>
        <Button type="submit" variant="secondary" disabled={busy}>
          {e.save}
        </Button>
      </div>
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
    </form>
  );
}
