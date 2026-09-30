import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  deleteKeys,
  type ItemKey,
  OWNER_TENANT,
  queryKeys,
  tenantKey,
  type TenantDataSource,
} from "@kundenportal/service-kit";
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
  constructor(private readonly data: TenantDataSource) {}

  async linkSubject(tenantId: string, subject: string, customerId: string): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "CONSUMPTION", customerId },
      }),
    );
  }

  async customerOf(tenantId: string, subject: string): Promise<string | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "CONSUMPTION" },
      }),
    );
    return result.Item?.customerId as string | undefined;
  }

  async contract(tenantId: string, contractId: string): Promise<ContractProjection | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
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
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new PutCommand({
          TableName: tableName,
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
    const { db, tableName } = await this.data(OWNER_TENANT);
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: WATCH_PK,
          SK: contractPk(contract.tenantId, contract.contractId),
          ...contract,
        },
      }),
    );
  }

  async unwatch(tenantId: string, contractId: string): Promise<void> {
    const { db, tableName } = await this.data(OWNER_TENANT);
    await db.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { PK: WATCH_PK, SK: contractPk(tenantId, contractId) },
      }),
    );
  }

  /**
   * Ids of the contracts whose projection belongs to one of these customers (at most 100,
   * the limit of `IN`). There is no index by customer, so this scans the tenant's table —
   * acceptable for the rare demo reset and the demo's few hundred items; a regular use
   * case would need a `CUST#…` item per contract instead.
   */
  async contractsOf(tenantId: string, customerIds: readonly string[]): Promise<string[]> {
    if (customerIds.length === 0) return [];
    const { db, tableName } = await this.data(tenantId);
    const values = Object.fromEntries(customerIds.map((id, i) => [`:c${i}`, id]));
    const ids: string[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const result = await db.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: `SK = :sk AND begins_with(PK, :prefix) AND customerId IN (${Object.keys(values).join(", ")})`,
          ExpressionAttributeValues: {
            ":sk": "CONSUMPTION",
            ":prefix": `${tenantKey(tenantId, "CONTRACT")}#`,
            ...values,
          },
          ProjectionExpression: "contractId",
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of result.Items ?? []) ids.push(item.contractId as string);
      startKey = result.LastEvaluatedKey;
    } while (startKey);
    return ids;
  }

  /**
   * Deletes everything the domain keeps of a contract: watch list entry, readings, usage
   * and — last, so a failed attempt can find the contract again — the projection.
   */
  async removeContract(tenantId: string, contractId: string): Promise<void> {
    await this.unwatch(tenantId, contractId);
    const table = await this.data(tenantId);
    const keys = await queryKeys(table, contractPk(tenantId, contractId));
    const last = (key: ItemKey) => (key.SK === "CONSUMPTION" ? 1 : 0);
    await deleteKeys(
      table,
      [...keys].sort((a, b) => last(a) - last(b)),
    );
  }

  /** Deletes the identity link (removed account); nothing left is no error. */
  async unlinkSubject(tenantId: string, subject: string): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "CONSUMPTION" },
      }),
    );
  }

  async *watched(): AsyncGenerator<WatchedContract> {
    const { db, tableName } = await this.data(OWNER_TENANT);
    let startKey: Record<string, unknown> | undefined;
    do {
      const result = await db.send(
        new QueryCommand({
          TableName: tableName,
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
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new QueryCommand({
        TableName: tableName,
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
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new PutCommand({
          TableName: tableName,
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
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
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
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({
        TableName: tableName,
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
