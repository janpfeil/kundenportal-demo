import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { deleteKeys, queryKeys, tenantKey, type TenantDataSource } from "@kundenportal/service-kit";
import { Document } from "./model.js";

const PAGE_SIZE = 50;

const documentKey = (tenantId: string, customerId: string, id: string) => ({
  PK: tenantKey(tenantId, "CUST", customerId),
  SK: `DOC#${id}`,
});

/**
 * Items of the documents domain in the single table (fachkonzept §7.1):
 * - `TENANT#<t>#CUST#<customerId>` / `DOC#<documentId>` — document metadata; the id
 *   starts with the creation time, so the sort key orders by date as in §7.1
 * - `TENANT#<t>#SUBJ#<subject>` / `DOCUMENTS` — own projection of `CustomerRegistered`
 */
export class DocumentRepository {
  constructor(private readonly data: TenantDataSource) {}

  async linkSubject(tenantId: string, subject: string, customerId: string): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "DOCUMENTS", customerId },
      }),
    );
  }

  async customerOf(tenantId: string, subject: string): Promise<string | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "DOCUMENTS" },
      }),
    );
    return result.Item?.customerId as string | undefined;
  }

  async list(tenantId: string, customerId: string): Promise<Document[]> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :doc)",
        ExpressionAttributeValues: {
          ":pk": tenantKey(tenantId, "CUST", customerId),
          ":doc": "DOC#",
        },
        ScanIndexForward: false,
        Limit: PAGE_SIZE,
      }),
    );
    return (result.Items ?? []).map((item) => Document.parse(item));
  }

  async get(tenantId: string, customerId: string, id: string): Promise<Document | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: documentKey(tenantId, customerId, id),
        ConsistentRead: true,
      }),
    );
    return result.Item ? Document.parse(result.Item) : undefined;
  }

  /** Ids of all documents of a customer, across pages (removed account). */
  async documentIds(tenantId: string, customerId: string): Promise<string[]> {
    const keys = await queryKeys(
      await this.data(tenantId),
      tenantKey(tenantId, "CUST", customerId),
      "DOC#",
    );
    return keys.map((key) => key.SK.slice("DOC#".length));
  }

  /** Deletes these documents' items and the identity link; nothing left is no error. */
  async removeCustomer(
    tenantId: string,
    subject: string,
    customerId: string,
    documentIds: readonly string[],
  ): Promise<void> {
    await deleteKeys(await this.data(tenantId), [
      ...documentIds.map((id) => documentKey(tenantId, customerId, id)),
      { PK: tenantKey(tenantId, "SUBJ", subject), SK: "DOCUMENTS" },
    ]);
  }

  async save(tenantId: string, customerId: string, document: Document): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: { ...documentKey(tenantId, customerId, document.documentId), ...document },
      }),
    );
  }
}
