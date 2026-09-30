/*
 * Upload rules shared by the browser (checks before announcing a file) and the zones' route
 * handlers (validation of the announcement). Free of server APIs, so client components may
 * import it (`@kundenportal/web-auth/upload`).
 */
import type {
  DocumentCategory,
  UploadContentType,
  UploadUrlRequest,
} from "@kundenportal/api-contract";

/** Types and size the documents service signs uploads for (see UploadUrlRequest). */
export const UPLOAD_CONTENT_TYPES: readonly UploadContentType[] = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];
export const DOCUMENT_CATEGORIES: readonly DocumentCategory[] = ["meter-photo", "other"];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_FILE_NAME = 120;

export type FileProblem = "missing" | "type" | "size" | "empty";

/** Checks a chosen file before announcing it; `undefined` if it may be uploaded. */
export function checkFile(
  file: { type: string; size: number } | undefined | null,
): FileProblem | undefined {
  if (!file) return "missing";
  if (!(UPLOAD_CONTENT_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > MAX_UPLOAD_BYTES) return "size";
  return undefined;
}

/**
 * The file name as the documents service accepts it: no path separators or control
 * characters, at most 120 characters (the extension is kept when shortening).
 */
export function uploadFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[/\\\u0000-\u001f\u007f-\u009f]/g, "_").trim() || "upload";
  if (cleaned.length <= MAX_FILE_NAME) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, MAX_FILE_NAME - extension.length) + extension;
}

/** The announcement for a file the browser is about to upload. */
export function uploadRequest(
  file: { name: string; type: string; size: number },
  category: DocumentCategory,
): UploadUrlRequest {
  return {
    fileName: uploadFileName(file.name),
    contentType: file.type as UploadContentType,
    sizeBytes: file.size,
    category,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validates the body the browser sends to the zone's upload route; `undefined` if invalid. */
export function parseUploadRequest(body: unknown): UploadUrlRequest | undefined {
  if (!isRecord(body)) return undefined;
  const allowed = new Set(["fileName", "contentType", "sizeBytes", "category"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return undefined;
  const { fileName, contentType, sizeBytes, category } = body;
  if (typeof fileName !== "string" || fileName.trim() === "" || fileName.length > MAX_FILE_NAME)
    return undefined;
  if (
    typeof contentType !== "string" ||
    !(UPLOAD_CONTENT_TYPES as readonly string[]).includes(contentType)
  )
    return undefined;
  if (typeof sizeBytes !== "number" || !Number.isInteger(sizeBytes)) return undefined;
  if (sizeBytes < 1 || sizeBytes > MAX_UPLOAD_BYTES) return undefined;
  if (
    category !== undefined &&
    (typeof category !== "string" || !(DOCUMENT_CATEGORIES as readonly string[]).includes(category))
  )
    return undefined;
  return {
    fileName,
    contentType: contentType as UploadContentType,
    sizeBytes,
    ...(category !== undefined ? { category: category as DocumentCategory } : {}),
  };
}
