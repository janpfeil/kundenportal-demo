import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { tenantKey } from "@kundenportal/service-kit";
import { ContractProjection, MeterReading } from "./model.js";

const PAGE_SIZE = 50;

/** Partition of the daily data volume check: one item per watched mobile contract. */
export const WATCH_PK = "SCHEDULE#DATAVOLUME";

export interface WatchedContract {
  tenantId: string;
  contractId: string;
  customerId: string;
  dataVolumeMb: number;
}

const contractPk = (tenantId: string, contractId: string) =>
  tenantKey(tenantId, "CONTRACT", contractId);

/**
 * Items of the consumption domain in the single table (fachkonzept §7.1):
 * - `TENANT#<t>#CONTRACT#<contractId>` / `READING#<readAt>#<readingId>` — meter readings
 * - `TENANT#<t>#CONTRACT#<contractId>` / `USAGE#<month>` — data volume warning sent
 * - `TENANT#<t>#CONTRACT#<contractId>` / `CONSUMPTION` — own projection of `ContractChanged`
 * - `TENANT#<t>#SUBJ#<subject>` / `CONSUMPTION` — own projection of `CustomerRegistered`
 * - `SCHEDULE#DATAVOLUME` / `TENANT#<t>#CONTRACT#<contractId>` — mobile contracts the
 *   scheduled check visits; the only key not led by the tenant, because the check runs
 *   across tenants (the tenant still leads the sort key)
 */
export class ConsumptionRepository {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  async linkSubject(tenantId: string, subject: string, customerId: string): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "CONSUMPTION", customerId },
      }),
    );
  }

  async customerOf(tenantId: string, subject: string): Promise<string | undefined> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "CONSUMPTION" },
      }),
    );
    return result.Item?.customerId as string | undefined;
  }

  async contract(tenantId: string, contractId: string): Promise<ContractProjection | undefined> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: contractPk(tenantId, contractId), SK: "CONSUMPTION" },
      }),
    );
    return result.Item ? ContractProjection.parse(result.Item) : undefined;
  }

  /**
   * Stores the projection unless a newer version is already there (events may arrive out
   * of order); returns `false` for a stale snapshot.
   */
  async saveContract(tenantId: string, contract: ContractProjection): Promise<boolean> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: { PK: contractPk(tenantId, contract.contractId), SK: "CONSUMPTION", ...contract },
          ConditionExpression: "attribute_not_exists(PK) OR #version < :version",
          ExpressionAttributeNames: { "#version": "version" },
          ExpressionAttributeValues: { ":version": contract.version },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async watch(contract: WatchedContract): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          PK: WATCH_PK,
          SK: contractPk(contract.tenantId, contract.contractId),
          ...contract,
        },
      }),
    );
  }

  async unwatch(tenantId: string, contractId: string): Promise<void> {
    await this.db.send(
      new DeleteCommand({
        TableName: this.table,
        Key: { PK: WATCH_PK, SK: contractPk(tenantId, contractId) },
      }),
    );
  }

  async *watched(): AsyncGenerator<WatchedContract> {
    let startKey: Record<string, unknown> | undefined;
    do {
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": WATCH_PK },
          ExclusiveStartKey: startKey,
          Limit: PAGE_SIZE,
        }),
      );
      for (const item of result.Items ?? []) yield item as WatchedContract;
      startKey = result.LastEvaluatedKey;
    } while (startKey);
  }

  async readings(tenantId: string, contractId: string, limit = PAGE_SIZE): Promise<MeterReading[]> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :reading)",
        ExpressionAttributeValues: {
          ":pk": contractPk(tenantId, contractId),
          ":reading": "READING#",
        },
        ScanIndexForward: false,
        Limit: limit,
        ConsistentRead: true,
      }),
    );
    return (result.Items ?? []).map((item) => MeterReading.parse(item));
  }

  /** Stores a reading once; returns `false` if it already exists (redelivered event). */
  async addReading(tenantId: string, contractId: string, reading: MeterReading): Promise<boolean> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            PK: contractPk(tenantId, contractId),
            SK: `READING#${reading.readAt}#${reading.readingId}`,
            ...reading,
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

  async thresholdNotified(tenantId: string, contractId: string, month: string): Promise<boolean> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: contractPk(tenantId, contractId), SK: `USAGE#${month}` },
      }),
    );
    return Boolean(result.Item?.thresholdNotifiedAt);
  }

  async markThresholdNotified(
    tenantId: string,
    contractId: string,
    month: string,
    usedMb: number,
    at: string,
  ): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          PK: contractPk(tenantId, contractId),
          SK: `USAGE#${month}`,
          month,
          usedMb,
          thresholdNotifiedAt: at,
        },
      }),
    );
  }
}
