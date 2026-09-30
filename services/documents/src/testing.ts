import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { S3Client } from "@aws-sdk/client-s3";
import type { TenantDataSource } from "@kundenportal/service-kit";
import { fixedTenantData } from "@kundenportal/service-kit/testing";
import { DocumentEvents } from "./publisher.js";
import { UploadQuota } from "./quota.js";
import { DocumentRepository } from "./repository.js";
import { DocumentService } from "./service.js";
import { UploadStorage } from "./storage.js";

export const BUCKET = "uploads-bucket";

/** One table and an S3 client with fake credentials for every tenant (tests only). */
export const testTenantData = (): TenantDataSource =>
  fixedTenantData("table", {
    s3: new S3Client({
      region: "eu-central-1",
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: { accessKeyId: "AKIDTEST", secretAccessKey: "secret" },
    }),
  });

/** Service with fake credentials, fixed time/ids and an upload quota of 20 (unit tests). */
export function testService(
  now: () => Date,
  ids: () => string,
  data: TenantDataSource = testTenantData(),
): DocumentService {
  const events = new DocumentEvents(new EventBridgeClient({}), "bus");
  return new DocumentService(
    new DocumentRepository(data),
    new UploadStorage(data, BUCKET),
    events,
    { now },
    ids,
    new UploadQuota(data, events, 20, now),
  );
}
