import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DocumentEvents } from "./publisher.js";
import { DocumentRepository } from "./repository.js";
import { DocumentService } from "./service.js";
import { UploadStorage } from "./storage.js";

export const BUCKET = "uploads-bucket";

/** Service with fake credentials and fixed time/ids for the unit tests. */
export function testService(now: () => Date, ids: () => string): DocumentService {
  return new DocumentService(
    new DocumentRepository(DynamoDBDocumentClient.from(new DynamoDBClient({})), "table"),
    new UploadStorage(
      new S3Client({
        region: "eu-central-1",
        requestChecksumCalculation: "WHEN_REQUIRED",
        credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "secret" },
      }),
      BUCKET,
    ),
    new DocumentEvents(new EventBridgeClient({}), "bus"),
    { now },
    ids,
  );
}
