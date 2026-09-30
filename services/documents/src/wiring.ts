import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { createTenantDataSource, requireEnv } from "@kundenportal/service-kit";
import { UPLOAD_URL_SECONDS } from "./model.js";
import { DocumentEvents } from "./publisher.js";
import { DocumentRepository } from "./repository.js";
import { DocumentService } from "./service.js";
import { UploadStorage } from "./storage.js";

/**
 * Builds the service with real AWS clients, once per execution environment; repository
 * and storage resolve each tenant's table, S3 client and credentials per call.
 */
export function createService(): DocumentService {
  const data = createTenantDataSource({
    // Without this the presigned URL carries a checksum of an empty body (see UploadStorage).
    s3Config: { requestChecksumCalculation: "WHEN_REQUIRED" },
    // A presigned URL dies with its credentials: keep them valid for the URL's lifetime.
    minValiditySeconds: UPLOAD_URL_SECONDS + 60,
  });
  return new DocumentService(
    new DocumentRepository(data),
    new UploadStorage(data, requireEnv("UPLOAD_BUCKET")),
    new DocumentEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  );
}
