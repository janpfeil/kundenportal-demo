import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { TenantDataSource } from "@kundenportal/service-kit";

/**
 * The upload bucket: presigned PUT URLs for the browser, deletion of rejected files.
 * Both use the S3 client of the key's tenant: for a demo pass it carries vended
 * credentials that only reach `uploads/<tenant>/*` (architektur-mandanten §3).
 */
export class UploadStorage {
  constructor(
    private readonly data: TenantDataSource,
    readonly bucket: string,
  ) {}

  /**
   * Presigned PUT URL that only accepts exactly this content type and length: both headers
   * are signed, so S3 refuses any other file. The S3 clients must be created with
   * `requestChecksumCalculation: "WHEN_REQUIRED"`; otherwise the SDK adds a checksum of the
   * empty body to the URL and every real upload fails. With vended credentials the URL is
   * valid only while they are, so the tenant data source must keep them valid for at
   * least `expiresIn` seconds.
   */
  async uploadUrl(
    tenantId: string,
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresIn: number,
  ): Promise<string> {
    const { s3 } = await this.data(tenantId);
    return getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      }),
      { expiresIn, signableHeaders: new Set(["content-type", "content-length"]) },
    );
  }

  async delete(tenantId: string, key: string): Promise<void> {
    const { s3 } = await this.data(tenantId);
    await s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
