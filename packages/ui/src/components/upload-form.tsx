"use client";

import { type JsonResponse, sendJson } from "@kundenportal/web-auth/browser";
import {
  type FileProblem,
  UPLOAD_CONTENT_TYPES,
  checkFile,
  uploadRequest,
} from "@kundenportal/web-auth/upload";
import type { DocumentCategory, UploadTicket, UploadUrlRequest } from "@kundenportal/api-contract";
import { type FormEvent, useId, useRef, useState } from "react";
import { fill } from "../i18n/index.js";
import { Button } from "./button.js";
import { Notice } from "./feedback.js";
import { Select } from "./fields.js";

/** Texts of the upload form; each zone words them for its documents (`{name}` = file name). */
export interface UploadTexts {
  file: string;
  hint: string;
  category: string;
  submit: string;
  busy: string;
  success: string;
  errorMissing: string;
  errorType: string;
  errorSize: string;
  errorEmpty: string;
  errorSetup: string;
  /** The demo pass has used up its uploads (429 from the documents service). */
  errorQuota: string;
  errorSession: string;
  errorGeneric: string;
  login: string;
}

export interface UploadFormProps {
  texts: UploadTexts;
  /** Route handler of the zone that announces the upload (path including basePath). */
  endpoint: string;
  /** Shell sign-in that returns here, shown when the session has expired. */
  loginHref: string;
  /** Selectable categories; with a single entry no choice is shown. */
  categories: readonly { value: DocumentCategory; label: string }[];
  /** Restricts the file picker, e.g. to images for meter photos. */
  accept?: readonly string[];
  /** Label of the file field (defaults to the generic one). */
  fileLabel?: string;
  /** Called after the file reached S3, e.g. to reload the document list. */
  onUploaded?: () => void;
  /** Announces the file; defaults to a signed JSON POST to `endpoint` (for stories and tests). */
  announce?: (request: UploadUrlRequest) => Promise<JsonResponse<UploadTicket>>;
  "data-testid"?: string;
}

type Feedback = { tone: "success" | "error"; text: string; login?: boolean };

const PROBLEM_TEXT: Record<FileProblem, keyof UploadTexts> = {
  missing: "errorMissing",
  type: "errorType",
  size: "errorSize",
  empty: "errorEmpty",
};

/**
 * Upload in two steps: the zone's route handler announces the file to the documents
 * service and returns a presigned URL; the browser then sends the file directly to S3 with
 * exactly the returned headers (content type and length are part of the signature).
 */
export function UploadForm({
  texts,
  endpoint,
  loginHref,
  categories,
  accept = UPLOAD_CONTENT_TYPES,
  fileLabel,
  onUploaded,
  announce = (request) => sendJson<UploadTicket>("POST", endpoint, request),
  "data-testid": testId,
}: UploadFormProps) {
  const fileId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<DocumentCategory>(categories[0]?.value ?? "other");
  const [fileError, setFileError] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFeedback(undefined);
    const file = input.current?.files?.[0];
    const fileProblem =
      checkFile(file) ?? (file && !accept.includes(file.type) ? "type" : undefined);
    if (!file || fileProblem) {
      setFileError(texts[PROBLEM_TEXT[fileProblem ?? "missing"]]);
      input.current?.focus();
      return;
    }
    setFileError(undefined);
    setBusy(true);
    try {
      const announced = await announce(uploadRequest(file, category));
      if (!announced.ok || !announced.data) {
        if (announced.status === 401)
          setFeedback({ tone: "error", text: texts.errorSession, login: true });
        else if (announced.status === 409) setFeedback({ tone: "error", text: texts.errorSetup });
        else if (announced.status === 429) setFeedback({ tone: "error", text: texts.errorQuota });
        else setFeedback({ tone: "error", text: texts.errorGeneric });
        return;
      }
      const ticket = announced.data;
      const uploaded = await fetch(ticket.uploadUrl, {
        method: ticket.method,
        headers: ticket.headers,
        body: file,
      });
      if (!uploaded.ok) {
        setFeedback({ tone: "error", text: texts.errorGeneric });
        return;
      }
      setFeedback({ tone: "success", text: fill(texts.success, { name: file.name }) });
      form.reset();
      onUploaded?.();
    } catch {
      setFeedback({ tone: "error", text: texts.errorGeneric });
    } finally {
      setBusy(false);
    }
  }

  const hintId = `${fileId}-hint`;
  const errorId = `${fileId}-error`;
  return (
    <form className="kp-upload" onSubmit={submit} noValidate data-testid={testId}>
      <div className="kp-field">
        <label className="kp-label" htmlFor={fileId}>
          {fileLabel ?? texts.file}
        </label>
        <span className="kp-hint" id={hintId}>
          {texts.hint}
        </span>
        <input
          ref={input}
          id={fileId}
          name="file"
          type="file"
          className="kp-input kp-upload-file"
          accept={accept.join(",")}
          aria-invalid={fileError !== undefined ? true : undefined}
          aria-describedby={fileError !== undefined ? `${hintId} ${errorId}` : hintId}
          onChange={() => setFileError(undefined)}
        />
        {fileError !== undefined && (
          <span className="kp-error" id={errorId}>
            {fileError}
          </span>
        )}
      </div>
      {categories.length > 1 && (
        <Select
          label={texts.category}
          name="category"
          value={category}
          onChange={(event) => setCategory(event.target.value as DocumentCategory)}
          options={categories}
        />
      )}
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
