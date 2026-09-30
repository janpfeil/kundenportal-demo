import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { Division } from "@kundenportal/events";
import { tenantKey, type TenantDataSource } from "@kundenportal/service-kit";
import { ContractRecord } from "./contract.js";

const contractKey = (tenantId: string, customerId: string, division: Division, id: string) => ({
  PK: tenantKey(tenantId, "CUST", customerId),
  SK: `CONTRACT#${division}#${id}`,
});

/**
 * Items of the contract domain in the single table (fachkonzept §7.1):
 * - `TENANT#<t>#CUST#<customerId>` / `CONTRACT#<division>#<contractId>` — the contracts
 * - `TENANT#<t>#SUBJ#<subject>` / `CONTRACTS` — own projection from `CustomerRegistered`:
 *   which customer a sign-in identity belongs to (never the customer domain's items)
 */
export class ContractRepository {
  constructor(private readonly data: TenantDataSource) {}

  async linkSubject(tenantId: string, subject: string, customerId: string): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "CONTRACTS", customerId },
      }),
    );
  }

  async customerOf(tenantId: string, subject: string): Promise<string | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "CONTRACTS" },
      }),
    );
    return result.Item?.customerId as string | undefined;
  }

  async list(tenantId: string, customerId: string): Promise<ContractRecord[]> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :contract)",
        ExpressionAttributeValues: {
          ":pk": tenantKey(tenantId, "CUST", customerId),
          ":contract": "CONTRACT#",
        },
        ConsistentRead: true,
      }),
    );
    return (result.Items ?? []).map((item) => ContractRecord.parse(item));
  }

  /** Finds a contract of the customer by id (a customer has only a handful of contracts). */
  async find(
    tenantId: string,
    customerId: string,
    contractId: string,
  ): Promise<ContractRecord | undefined> {
    return (await this.list(tenantId, customerId)).find((c) => c.contractId === contractId);
  }

  async get(
    tenantId: string,
    customerId: string,
    division: Division,
    contractId: string,
  ): Promise<ContractRecord | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: contractKey(tenantId, customerId, division, contractId),
        ConsistentRead: true,
      }),
    );
    return result.Item ? ContractRecord.parse(result.Item) : undefined;
  }

  /** Creates a contract once; returns `false` if it already exists (redelivered event). */
  async create(tenantId: string, record: ContractRecord): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...contractKey(tenantId, record.customerId, record.division, record.contractId),
            ...record,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  /**
   * Replaces a contract if nobody changed it since it was read (optimistic locking on
   * `version`); returns `false` on a concurrent change.
   */
  async replace(
    tenantId: string,
    record: ContractRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...contractKey(tenantId, record.customerId, record.division, record.contractId),
            ...record,
          },
          ConditionExpression: "#version = :expected",
          ExpressionAttributeNames: { "#version": "version" },
          ExpressionAttributeValues: { ":expected": expectedVersion },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }
}
