import { DocumentCategory, UploadContentType } from "@kundenportal/events";
import { z } from "zod";

/** Upper limit of an upload; the presigned URL signs the exact length, the worker re-checks. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Validity of a presigned upload URL. */
export const UPLOAD_URL_SECONDS = 5 * 60;
/** The bucket's lifecycle rule deletes uploads after this many days. */
export const RETENTION_DAYS = 7;
/** Every upload lies below this prefix: `uploads/<tenantId>/<customerId>/<documentId>`. */
export const UPLOAD_PREFIX = "uploads/";

export const Document = z.object({
  documentId: z.string(),
  fileName: z.string(),
  contentType: UploadContentType,
  category: DocumentCategory,
  sizeBytes: z.number().int().positive(),
  /** `pending` until the file arrives in the bucket; `rejected` if it failed the checks. */
  status: z.enum(["pending", "uploaded", "rejected"]),
  createdAt: z.iso.datetime({ offset: true }),
  uploadedAt: z.iso.datetime({ offset: true }).optional(),
  /** When the lifecycle rule deletes the file (demo: 7 days). */
  expiresAt: z.iso.datetime({ offset: true }),
});
export type Document = z.infer<typeof Document>;

/** Body of `POST /documents/upload-url`; mirrors `UploadUrlRequest` in the OpenAPI contract. */
export const UploadRequest = z.strictObject({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^/\\\p{Cc}]+$/u, "The file name must not contain paths or control characters"),
  contentType: UploadContentType,
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  category: DocumentCategory.default("other"),
});
export type UploadRequest = z.infer<typeof UploadRequest>;

export interface UploadTicket {
  documentId: string;
  uploadUrl: string;
  method: "PUT";
  /** Headers the upload must send exactly like this (they are part of the signature). */
  headers: Record<string, string>;
  expiresAt: string;
}

const DOCUMENT_ID = /^[0-9a-z]{9}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Sortable document id: creation time (base 36, fixed width) plus a UUID. */
export function documentId(createdAt: string, uuid: string): string {
  return `${Date.parse(createdAt).toString(36).padStart(9, "0")}-${uuid}`;
}

export function uploadKey(tenantId: string, customerId: string, id: string): string {
  return `${UPLOAD_PREFIX}${tenantId}/${customerId}/${id}`;
}

/** Reads tenant, customer and document from an object key; `undefined` for foreign keys. */
export function parseUploadKey(
  key: string,
): { tenantId: string; customerId: string; documentId: string } | undefined {
  const [prefix, tenantId, customerId, id, ...rest] = key.split("/");
  if (`${prefix}/` !== UPLOAD_PREFIX || rest.length > 0) return undefined;
  if (!tenantId || !/^[a-z0-9-]{1,40}$/.test(tenantId)) return undefined;
  if (!customerId || !/^[A-Za-z0-9-]{1,64}$/.test(customerId)) return undefined;
  if (!id || !DOCUMENT_ID.test(id)) return undefined;
  return { tenantId, customerId, documentId: id };
}
