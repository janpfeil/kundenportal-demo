import { Duration, RemovalPolicy, Tags } from "aws-cdk-lib";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  type CfnBucket,
  HttpMethods,
  ObjectOwnership,
} from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { PROJECT_TAG } from "./config.js";

export interface UploadsProps {
  domainName: string;
  /** Allows uploads from http://localhost:3000 for local development of the shell. */
  allowLocalhost: boolean;
}

/** Days after which the lifecycle rule deletes an upload (the demo keeps nothing longer). */
export const UPLOAD_RETENTION_DAYS = 7;

/**
 * Bucket for customer uploads (meter photos, scanned letters). Browsers upload directly
 * with presigned PUT URLs from the documents service, so CORS allows PUT from the portal
 * only. S3 sends "Object Created" to the default EventBridge bus, where the documents
 * service picks it up; no bucket notification points at a function of the app stack, so
 * the app can be torn down while the bucket stays.
 */
export class Uploads extends Construct {
  readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: UploadsProps) {
    super(scope, id);
    const origins = [
      `https://${props.domainName}`,
      ...(props.allowLocalhost ? ["http://localhost:3000"] : []),
    ];

    this.bucket = new Bucket(this, "Bucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      cors: [
        {
          allowedMethods: [HttpMethods.PUT],
          allowedOrigins: origins,
          allowedHeaders: ["content-type"],
          exposedHeaders: ["ETag"],
          maxAge: 600,
        },
      ],
      lifecycleRules: [
        {
          id: "delete-uploads",
          expiration: Duration.days(UPLOAD_RETENTION_DAYS),
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    // Set directly instead of `eventBridgeEnabled`, which would add a custom-resource Lambda.
    (this.bucket.node.defaultChild as CfnBucket).notificationConfiguration = {
      eventBridgeConfiguration: { eventBridgeEnabled: true },
    };
    Tags.of(this.bucket).add("project", PROJECT_TAG);
  }
}
