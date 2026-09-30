import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { type DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { tenantKey } from "@kundenportal/service-kit";

/**
 * Item of the identity domain: `TENANT#<t>#SUBJ#<subject>` / `IDENTITY#LEGACY` records
 * that the lazy migration of this identity was announced (`LegacyAccountMigrated`).
 */
export class AnnouncementRepository {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  private key(tenantId: string, subject: string) {
    return { PK: tenantKey(tenantId, "SUBJ", subject), SK: "IDENTITY#LEGACY" };
  }

  async announced(tenantId: string, subject: string): Promise<boolean> {
    const result = await this.db.send(
      new GetCommand({ TableName: this.table, Key: this.key(tenantId, subject) }),
    );
    return Boolean(result.Item);
  }

  async markAnnounced(tenantId: string, subject: string, eventId: string, at: string) {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: { ...this.key(tenantId, subject), eventId, announcedAt: at },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
    }
  }
}
