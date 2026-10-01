import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { tenantKey, type TenantDataSource } from "@kundenportal/service-kit";
import { ProductRecord } from "./products.js";

const productKey = (tenantId: string, productId: string) => ({
  PK: tenantKey(tenantId, "PRODUCTS"),
  SK: `PRODUCT#${productId}`,
});

/**
 * The tenant's product catalogue: `TENANT#<t>#PRODUCTS` / `PRODUCT#<productId>`, one item
 * per product with every price version (a handful of options each, far below the item
 * limit). The whole catalogue is one small partition and read with one Query.
 */
export class ProductRepository {
  constructor(private readonly data: TenantDataSource) {}

  async list(tenantId: string): Promise<ProductRecord[]> {
    const { db, tableName } = await this.data(tenantId);
    const products: ProductRecord[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const result = await db.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": tenantKey(tenantId, "PRODUCTS") },
          ExclusiveStartKey: start,
        }),
      );
      for (const item of result.Items ?? []) products.push(ProductRecord.parse(item));
      start = result.LastEvaluatedKey;
    } while (start);
    return products;
  }

  async get(tenantId: string, productId: string): Promise<ProductRecord | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({ TableName: tableName, Key: productKey(tenantId, productId) }),
    );
    return result.Item ? ProductRecord.parse(result.Item) : undefined;
  }

  /** Creates a product once; `false` if the id is taken. */
  async create(tenantId: string, product: ProductRecord): Promise<boolean> {
    return this.put(tenantId, product, { ConditionExpression: "attribute_not_exists(PK)" });
  }

  /** Replaces a product unless someone changed it since it was read. */
  async replace(tenantId: string, product: ProductRecord, expectedRevision: number) {
    return this.put(tenantId, product, {
      ConditionExpression: "#revision = :expected",
      ExpressionAttributeNames: { "#revision": "revision" },
      ExpressionAttributeValues: { ":expected": expectedRevision },
    });
  }

  private async put(
    tenantId: string,
    product: ProductRecord,
    condition: Record<string, unknown>,
  ): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new PutCommand({
          TableName: tableName,
          Item: { ...productKey(tenantId, product.productId), ...product },
          ...condition,
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }
}
