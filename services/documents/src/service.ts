import { randomUUID } from "node:crypto";
import { type CustomerRegisteredDetail, deterministicUuid } from "@kundenportal/events";
import { type Caller, HttpError, isPassTenant, log, OWNER_TENANT } from "@kundenportal/service-kit";
import {
  type Document,
  documentId,
  MAX_UPLOAD_BYTES,
  parseUploadKey,
  RETENTION_DAYS,
  UPLOAD_URL_SECONDS,
  type UploadRequest,
  type UploadTicket,
  uploadKey,
} from "./model.js";
import type { DocumentEvents } from "./publisher.js";
import type { UploadQuota } from "./quota.js";
import type { DocumentRepository } from "./repository.js";
import type { UploadStorage } from "./storage.js";

export interface Clock {
  now(): Date;
}

/** The part of an S3 "Object Created" event (EventBridge) the worker needs. */
export interface ObjectCreated {
  bucket: string;
  key: string;
  size: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Use cases of the documents domain, independent of Lambda, HTTP and S3 events. */
export class DocumentService {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly storage: UploadStorage,
    private readonly events: DocumentEvents,
    private readonly clock: Clock = { now: () => new Date() },
    private readonly newId: () => string = randomUUID,
    private readonly quota?: UploadQuota,
  ) {}

  async list(caller: Caller): Promise<Document[]> {
    const customerId = await this.repository.customerOf(caller.tenantId, caller.subject);
    return customerId ? this.repository.list(caller.tenantId, customerId) : [];
  }

  /**
   * Registers a pending document and returns a presigned PUT URL for exactly this file
   * (content type and size are signed), valid for five minutes. A demo pass pays one
   * upload of its quota per URL; at the limit the request fails with 429.
   */
  async requestUpload(
    caller: Caller,
    request: UploadRequest,
    correlationId = "upload-url",
  ): Promise<UploadTicket> {
    const customerId = await this.repository.customerOf(caller.tenantId, caller.subject);
    if (!customerId) {
      throw new HttpError(409, "Conflict", "The account is still being set up; try again shortly");
    }
    await this.quota?.consume(caller.tenantId, correlationId);
    const now = this.clock.now();
    const createdAt = now.toISOString();
    const document: Document = {
      documentId: documentId(createdAt, this.newId()),
      fileName: request.fileName,
      contentType: request.contentType,
      category: request.category,
      sizeBytes: request.sizeBytes,
      status: "pending",
      createdAt,
      expiresAt: new Date(now.getTime() + RETENTION_DAYS * DAY_MS).toISOString(),
    };
    await this.repository.save(caller.tenantId, customerId, document);
    const uploadUrl = await this.storage.uploadUrl(
      caller.tenantId,
      uploadKey(caller.tenantId, customerId, document.documentId),
      request.contentType,
      request.sizeBytes,
      UPLOAD_URL_SECONDS,
    );
    return {
      documentId: document.documentId,
      uploadUrl,
      method: "PUT",
      headers: { "content-type": request.contentType },
      expiresAt: new Date(now.getTime() + UPLOAD_URL_SECONDS * 1000).toISOString(),
    };
  }

  async onCustomerRegistered(event: CustomerRegisteredDetail): Promise<void> {
    await this.repository.linkSubject(
      event.tenantId,
      event.payload.subject,
      event.payload.customerId,
    );
  }

  /**
   * A file arrived in the upload bucket. Only files announced via `upload-url` with the
   * announced size stay; anything else is deleted. Accepted files publish
   * `DocumentUploaded` with an id derived from the document, so repeated S3 events
   * (retries, a second PUT with the same URL) are deduplicated downstream.
   */
  async onObjectCreated(object: ObjectCreated, correlationId: string): Promise<void> {
    if (object.bucket !== this.storage.bucket) {
      log("warn", "Event for a foreign bucket ignored", { bucket: object.bucket });
      return;
    }
    const parsed = parseUploadKey(object.key);
    // A key naming no known tenant is foreign; the owner's (Lambda's own) rights delete it.
    const target =
      parsed && (parsed.tenantId === OWNER_TENANT || isPassTenant(parsed.tenantId))
        ? parsed
        : undefined;
    const document = target
      ? await this.repository.get(target.tenantId, target.customerId, target.documentId)
      : undefined;
    if (!target || !document) {
      log("warn", "Unannounced upload deleted", { key: object.key });
      await this.storage.delete(target?.tenantId ?? OWNER_TENANT, object.key);
      return;
    }
    if (document.status === "rejected") return;
    const { tenantId, customerId } = target;

    if (document.status === "pending") {
      if (object.size > MAX_UPLOAD_BYTES || object.size !== document.sizeBytes) {
        log("warn", "Upload rejected", { key: object.key, size: object.size });
        await this.storage.delete(tenantId, object.key);
        await this.repository.save(tenantId, customerId, { ...document, status: "rejected" });
        return;
      }
      document.status = "uploaded";
      document.uploadedAt = this.clock.now().toISOString();
      await this.repository.save(tenantId, customerId, document);
    }

    await this.events.documentUploaded({
      eventId: deterministicUuid(tenantId, document.documentId, "uploaded"),
      tenantId,
      occurredAt: document.uploadedAt ?? this.clock.now().toISOString(),
      correlationId,
      payload: {
        customerId,
        documentId: document.documentId,
        fileName: document.fileName,
        contentType: document.contentType,
        category: document.category,
        sizeBytes: document.sizeBytes,
      },
    });
  }
}
