import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { tenantKey, type TenantDataSource } from "@kundenportal/service-kit";

/**
 * Item of the identity domain: `TENANT#<t>#SUBJ#<subject>` / `IDENTITY#LEGACY` records
 * that the lazy migration of this identity was announced (`LegacyAccountMigrated`).
 */
export class AnnouncementRepository {
  constructor(private readonly data: TenantDataSource) {}

  private key(tenantId: string, subject: string) {
    return { PK: tenantKey(tenantId, "SUBJ", subject), SK: "IDENTITY#LEGACY" };
  }

  async announced(tenantId: string, subject: string): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({ TableName: tableName, Key: this.key(tenantId, subject) }),
    );
    return Boolean(result.Item);
  }

  async markAnnounced(tenantId: string, subject: string, eventId: string, at: string) {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new PutCommand({
          TableName: tableName,
          Item: { ...this.key(tenantId, subject), eventId, announcedAt: at },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
    }
  }
}
