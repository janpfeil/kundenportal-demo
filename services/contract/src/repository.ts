import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Division } from "@kundenportal/events";
import {
  deleteKeys,
  type ItemKey,
  queryKeys,
  tenantKey,
  type TenantDataSource,
} from "@kundenportal/service-kit";
import { ContractRecord } from "./contract.js";
import { DirectoryEntry, toEntry } from "./directory.js";
import type { HistoryEntry } from "./history.js";

const contractKey = (tenantId: string, customerId: string, division: Division, id: string) => ({
  PK: tenantKey(tenantId, "CUST", customerId),
  SK: `CONTRACT#${division}#${id}`,
});
const directoryKey = (tenantId: string, contractId: string) => ({
  PK: tenantKey(tenantId, "CONTRACTS"),
  SK: `CONTRACT#${contractId}`,
});
/** Not `CONTRACT#…`: the customer's contract list queries that prefix. */
const historyPrefix = (contractId: string) => `HISTORY#${contractId}#`;
const historyKey = (tenantId: string, customerId: string, contractId: string, version: number) => ({
  PK: tenantKey(tenantId, "CUST", customerId),
  SK: `${historyPrefix(contractId)}${String(version).padStart(6, "0")}`,
});
const linkKey = (tenantId: string, subject: string) => ({
  PK: tenantKey(tenantId, "SUBJ", subject),
  SK: "CONTRACTS",
});

/** Whom a sign-in identity belongs to, as the contract domain's projection knows it. */
export interface CustomerLink {
  customerId: string;
  customerName?: string;
}

/**
 * Items of the contract domain in the single table (architektur.md):
 * - `TENANT#<t>#CUST#<customerId>` / `CONTRACT#<division>#<contractId>` — the contracts
 * - `TENANT#<t>#CUST#<customerId>` / `HISTORY#<contractId>#<version>` — one entry per
 *   change of a contract (the creation is derived from the contract itself)
 * - `TENANT#<t>#CONTRACTS` / `CONTRACT#<contractId>` — the tenant's contract directory
 * - `TENANT#<t>#SUBJ#<subject>` / `CONTRACTS` — own projection from `CustomerRegistered`:
 *   which customer a sign-in identity belongs to (never the customer domain's items)
 * - `TENANT#<t>#PRODUCTS` / `PRODUCT#<productId>` — the catalogue (`ProductRepository`)
 */
export class ContractRepository {
  constructor(private readonly data: TenantDataSource) {}

  async linkSubject(
    tenantId: string,
    subject: string,
    customerId: string,
    customerName?: string,
  ): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...linkKey(tenantId, subject),
          customerId,
          ...(customerName ? { customerName } : {}),
        },
      }),
    );
  }

  async customerOf(tenantId: string, subject: string): Promise<CustomerLink | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({ TableName: tableName, Key: linkKey(tenantId, subject) }),
    );
    const item = result.Item;
    if (typeof item?.customerId !== "string") return undefined;
    return {
      customerId: item.customerId,
      ...(typeof item.customerName === "string" ? { customerName: item.customerName } : {}),
    };
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

  /**
   * Writes a contract together with its directory entry and, for a change, its history
   * entry — in one transaction, so the directory never shows what did not happen. Without
   * `expectedVersion` the contract must not exist yet (creation); with it, nobody may have
   * changed the contract since it was read (optimistic locking). Returns `false` if the
   * condition failed (redelivered creation, concurrent change).
   */
  async save(
    tenantId: string,
    record: ContractRecord,
    options: { expectedVersion?: number; history?: HistoryEntry } = {},
  ): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    const stored: ContractRecord = { ...record, listed: true };
    const condition =
      options.expectedVersion === undefined
        ? { ConditionExpression: "attribute_not_exists(PK)" }
        : {
            ConditionExpression: "#version = :expected",
            ExpressionAttributeNames: { "#version": "version" },
            ExpressionAttributeValues: { ":expected": options.expectedVersion },
          };
    const items = [
      {
        Put: {
          TableName: tableName,
          Item: {
            ...contractKey(tenantId, record.customerId, record.division, record.contractId),
            ...stored,
          },
          ...condition,
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: { ...directoryKey(tenantId, record.contractId), ...toEntry(stored) },
        },
      },
      ...(options.history
        ? [
            {
              Put: {
                TableName: tableName,
                Item: {
                  ...historyKey(tenantId, record.customerId, record.contractId, record.version),
                  ...options.history,
                },
              },
            },
          ]
        : []),
    ];
    try {
      await db.send(new TransactWriteCommand({ TransactItems: items }));
      return true;
    } catch (error) {
      const reasons =
        error instanceof TransactionCanceledException ? error.CancellationReasons : [];
      if (
        reasons?.some(
          (r) => r.Code === "ConditionalCheckFailed" || r.Code === "TransactionConflict",
        )
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Adds a contract saved before phase 7 to the directory (2 writes, once per contract):
   * the entry first, then the mark on the contract (with the customer's name, if the
   * contract lacks it) — only if the contract did not change meanwhile; a concurrent save
   * has written the entry itself. Returns the contract as marked.
   */
  async backfill(
    tenantId: string,
    record: ContractRecord,
    customerName?: string,
  ): Promise<ContractRecord> {
    const { db, tableName } = await this.data(tenantId);
    const named = !record.customerName && customerName ? { customerName } : {};
    const marked: ContractRecord = { ...record, ...named, listed: true };
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: { ...directoryKey(tenantId, record.contractId), ...toEntry(marked) },
      }),
    );
    try {
      await db.send(
        new UpdateCommand({
          TableName: tableName,
          Key: contractKey(tenantId, record.customerId, record.division, record.contractId),
          UpdateExpression: named.customerName
            ? "SET listed = :listed, customerName = :name"
            : "SET listed = :listed",
          ConditionExpression: "#version = :version",
          ExpressionAttributeNames: { "#version": "version" },
          ExpressionAttributeValues: {
            ":listed": true,
            ":version": record.version,
            ...(named.customerName ? { ":name": named.customerName } : {}),
          },
        }),
      );
    } catch (error) {
      if ((error as Error).name !== "ConditionalCheckFailedException") throw error;
    }
    return marked;
  }

  /** The whole directory of a tenant (one partition, paged by DynamoDB at 1 MB). */
  async directory(tenantId: string): Promise<DirectoryEntry[]> {
    const { db, tableName } = await this.data(tenantId);
    const entries: DirectoryEntry[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const result = await db.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": tenantKey(tenantId, "CONTRACTS") },
          ExclusiveStartKey: start,
        }),
      );
      for (const item of result.Items ?? []) entries.push(DirectoryEntry.parse(item));
      start = result.LastEvaluatedKey;
    } while (start);
    return entries;
  }

  async directoryEntry(tenantId: string, contractId: string): Promise<DirectoryEntry | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({ TableName: tableName, Key: directoryKey(tenantId, contractId) }),
    );
    return result.Item ? DirectoryEntry.parse(result.Item) : undefined;
  }

  /** History entries of a contract, newest first (without the derived creation). */
  async history(tenantId: string, customerId: string, contractId: string): Promise<HistoryEntry[]> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": tenantKey(tenantId, "CUST", customerId),
          ":prefix": historyPrefix(contractId),
        },
        ScanIndexForward: false,
      }),
    );
    return (result.Items ?? []).map((item) => {
      const { at, change, by, reason, summary } = item as HistoryEntry;
      return {
        at,
        change,
        by,
        ...(reason ? { reason } : {}),
        ...(summary ? { summary } : {}),
      };
    });
  }

  /**
   * Deletes the customer's contracts with their history and directory entries, and the
   * identity link (removed account); returns how many contracts. Nothing left is no
   * error, so a redelivered event is harmless.
   */
  async removeCustomer(tenantId: string, subject: string, customerId: string): Promise<number> {
    const table = await this.data(tenantId);
    const partition = tenantKey(tenantId, "CUST", customerId);
    const contracts = await queryKeys(table, partition, "CONTRACT#");
    const history = await queryKeys(table, partition, "HISTORY#");
    const directory: ItemKey[] = contracts.map((key) =>
      directoryKey(tenantId, key.SK.split("#").pop() ?? ""),
    );
    await deleteKeys(table, [...contracts, ...history, ...directory, linkKey(tenantId, subject)]);
    return contracts.length;
  }
}
