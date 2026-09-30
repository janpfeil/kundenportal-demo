import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "@kundenportal/service-kit";
import { DocumentEvents } from "./publisher.js";
import { DocumentRepository } from "./repository.js";
import { DocumentService } from "./service.js";
import { UploadStorage } from "./storage.js";

/** Builds the service with real AWS clients, once per execution environment. */
export function createService(): DocumentService {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return new DocumentService(
    new DocumentRepository(db, requireEnv("TABLE_NAME")),
    new UploadStorage(
      // Without this the presigned URL carries a checksum of an empty body (see UploadStorage).
      new S3Client({ requestChecksumCalculation: "WHEN_REQUIRED" }),
      requireEnv("UPLOAD_BUCKET"),
    ),
    new DocumentEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  );
}
