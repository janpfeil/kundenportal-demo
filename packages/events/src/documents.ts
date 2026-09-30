import { z } from "zod";
import { EventSource, eventDetailSchema } from "./envelope.js";

/** Content types the portal accepts for uploads (meter photos, scanned letters). */
export const UploadContentType = z.enum(["image/jpeg", "image/png", "application/pdf"]);
export type UploadContentType = z.infer<typeof UploadContentType>;

export const DocumentCategory = z.enum(["meter-photo", "other"]);
export type DocumentCategory = z.infer<typeof DocumentCategory>;

/** A customer's upload arrived in the upload bucket and passed the checks. */
export const DocumentUploaded = {
  source: EventSource.documents,
  detailType: "DocumentUploaded",
  detail: eventDetailSchema(
    z.object({
      customerId: z.string().min(1),
      documentId: z.string().min(1),
      fileName: z.string().min(1),
      contentType: UploadContentType,
      category: DocumentCategory,
      sizeBytes: z.number().int().positive(),
    }),
  ),
} as const;
export type DocumentUploadedDetail = z.infer<typeof DocumentUploaded.detail>;
