import { DeleteObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** The upload bucket: presigned PUT URLs for the browser, deletion of rejected files. */
export class UploadStorage {
  constructor(
    private readonly s3: S3Client,
    readonly bucket: string,
  ) {}

  /**
   * Presigned PUT URL that only accepts exactly this content type and length: both headers
   * are signed, so S3 refuses any other file. The client must be created with
   * `requestChecksumCalculation: "WHEN_REQUIRED"`; otherwise the SDK adds a checksum of the
   * empty body to the URL and every real upload fails.
   */
  async uploadUrl(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresIn: number,
  ): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      }),
      { expiresIn, signableHeaders: new Set(["content-type", "content-length"]) },
    );
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
