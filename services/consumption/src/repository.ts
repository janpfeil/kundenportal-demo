import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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
  /** First day of the contract; the check skips it before (orders with a later start). */
  startsOn?: string;
  /** Last day of a pending termination; the check drops it after that day. */
  endsOn?: string;
}

const contractPk = (tenantId: string, contractId: string) =>
  tenantKey(tenantId, "CONTRACT", contractId);
/** The customer's index entry of a contract: removing a customer finds its contracts. */
const indexKey = (tenantId: string, customerId: string, contractId: string): ItemKey => ({
  PK: tenantKey(tenantId, "CUST", customerId),
  SK: `${INDEX_PREFIX}${contractId}`,
});
const INDEX_PREFIX = "CONSUMPTION#";
/** Mark of the one-off backfill of the customer index (version 1) of a tenant. */
const backfillKey = (tenantId: string): ItemKey => ({
  PK: tenantKey(tenantId, "BACKFILL"),
  SK: "CONSUMPTION#v1",
});

/**
 * Items of the consumption domain in the single table (fachkonzept §7.1):
 * - `TENANT#<t>#CONTRACT#<contractId>` / `READING#<readAt>#<readingId>` — meter readings
 * - `TENANT#<t>#CONTRACT#<contractId>` / `USAGE#<month>` — data volume warning sent
 * - `TENANT#<t>#CONTRACT#<contractId>` / `CONSUMPTION` — own projection of `ContractChanged`
 * - `TENANT#<t>#SUBJ#<subject>` / `CONSUMPTION` — own projection of `CustomerRegistered`
 * - `TENANT#<t>#CUST#<customerId>` / `CONSUMPTION#<contractId>` — index of the customer's
 *   contracts, written with the projection, so removing a customer needs no scan
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
    let before: Record<string, unknown> | undefined;
    try {
      const result = await db.send(
        new PutCommand({
          TableName: tableName,
          Item: { PK: contractPk(tenantId, contract.contractId), SK: "CONSUMPTION", ...contract },
          ConditionExpression: "attribute_not_exists(PK) OR #version < :version",
          ExpressionAttributeNames: { "#version": "version" },
          ExpressionAttributeValues: { ":version": contract.version },
          ReturnValues: "ALL_OLD",
        }),
      );
      before = result.Attributes;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
    await this.index(tenantId, contract.customerId, contract.contractId);
    // Account linking moves a contract to another customer: the old entry goes.
    const previous = before?.customerId;
    if (typeof previous === "string" && previous !== contract.customerId) {
      await db.send(
        new DeleteCommand({
          TableName: tableName,
          Key: indexKey(tenantId, previous, contract.contractId),
        }),
      );
    }
    return true;
  }

  /** Writes the customer's index entry of a contract (also used by the backfill). */
  async index(tenantId: string, customerId: string, contractId: string): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: { ...indexKey(tenantId, customerId, contractId), contractId },
      }),
    );
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
   * The contracts of these customers, from their index entries (one query per customer, no
   * scan). An entry whose contract has moved to another customer since (account linking)
   * is stale and goes; a contract whose projection is already gone is still returned, so
   * its remaining items and the entry are removed.
   */
  async contractsOf(
    tenantId: string,
    customerIds: readonly string[],
  ): Promise<{ contractId: string; customerId: string }[]> {
    const table = await this.data(tenantId);
    const owned: { contractId: string; customerId: string }[] = [];
    for (const customerId of customerIds) {
      const entries = await queryKeys(table, tenantKey(tenantId, "CUST", customerId), INDEX_PREFIX);
      for (const entry of entries) {
        const contractId = entry.SK.slice(INDEX_PREFIX.length);
        const projection = await this.contract(tenantId, contractId);
        if (projection && projection.customerId !== customerId) {
          await deleteKeys(table, [entry]);
          continue;
        }
        owned.push({ contractId, customerId });
      }
    }
    return owned;
  }

  /**
   * Deletes everything the domain keeps of a contract: watch list entry, readings, usage,
   * the projection and — last, so a failed attempt can find the contract again — the
   * customer's index entry.
   */
  async removeContract(tenantId: string, contractId: string, customerId: string): Promise<void> {
    await this.unwatch(tenantId, contractId);
    const table = await this.data(tenantId);
    const keys = await queryKeys(table, contractPk(tenantId, contractId));
    const last = (key: ItemKey) => (key.SK === "CONSUMPTION" ? 1 : 0);
    await deleteKeys(
      table,
      [...keys].sort((a, b) => last(a) - last(b)),
    );
    // The index entry goes last: a failed attempt still finds the contract again.
    await deleteKeys(table, [indexKey(tenantId, customerId, contractId)]);
  }

  /** When the one-off backfill of the customer index finished, if it did. */
  async backfillFinished(tenantId: string): Promise<string | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({ TableName: tableName, Key: backfillKey(tenantId), ConsistentRead: true }),
    );
    return typeof result.Item?.finishedAt === "string" ? result.Item.finishedAt : undefined;
  }

  async markBackfillFinished(
    tenantId: string,
    result: { finishedAt: string; contracts: number },
  ): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({ TableName: tableName, Item: { ...backfillKey(tenantId), ...result } }),
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
