import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  deleteKeys,
  type ItemKey,
  log,
  queryKeys,
  tenantKey,
  type TenantDataSource,
} from "@kundenportal/service-kit";
import {
  DirectoryContract,
  DirectoryProfile,
  type DirectoryProfile as Profile,
} from "./directory.js";

/** Partition of a tenant's customer directory. */
export const directoryPk = (tenantId: string) => tenantKey(tenantId, "CUSTOMERS");

export const profileKey = (tenantId: string, customerId: string): ItemKey => ({
  PK: directoryPk(tenantId),
  SK: `CUST#${customerId}`,
});

const contractPrefix = (customerId: string) => `CUST#${customerId}#C#`;

export const contractKey = (tenantId: string, customerId: string, contractId: string): ItemKey => ({
  PK: directoryPk(tenantId),
  SK: `${contractPrefix(customerId)}${contractId}`,
});

/** The directory item of a profile, ready for a Put (also inside a transaction). */
export function profileItem(tenantId: string, profile: Profile, rev: number) {
  return { ...profileKey(tenantId, profile.customerId), ...profile, rev };
}

export interface DirectoryEntry {
  profile?: Profile;
  contracts: DirectoryContract[];
}

/**
 * The customer directory in the single table (phase 7, one partition per tenant):
 * - `TENANT#<t>#CUSTOMERS` / `CUST#<customerId>` — profile summary; `rev` follows the
 *   profile's own counter, so an older write never overwrites a newer one
 * - `TENANT#<t>#CUSTOMERS` / `CUST#<customerId>#C#<contractId>` — contract summary from
 *   `ContractChanged`, kept by `version`; it may arrive before the profile
 *
 * The cockpit's list reads the whole partition with one paginated Query (a few hundred
 * small items in the demo) and filters in memory; nothing scans the table.
 */
export class DirectoryRepository {
  constructor(private readonly data: TenantDataSource) {}

  /** Writes the profile summary unless a newer one (higher `rev`) is there; `false` then. */
  async putProfile(tenantId: string, profile: Profile, rev: number): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new PutCommand({
          TableName: tableName,
          Item: profileItem(tenantId, profile, rev),
          ConditionExpression: "attribute_not_exists(PK) OR #rev < :rev",
          ExpressionAttributeNames: { "#rev": "rev" },
          ExpressionAttributeValues: { ":rev": rev },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  /** Writes the contract summary unless a newer version is there; `false` for a stale one. */
  async putContract(tenantId: string, contract: DirectoryContract): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new PutCommand({
          TableName: tableName,
          Item: { ...contractKey(tenantId, contract.customerId, contract.contractId), ...contract },
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

  /** Every entry of the tenant's directory, grouped by customer. */
  async entries(tenantId: string): Promise<Map<string, DirectoryEntry>> {
    return group(await this.query(tenantId));
  }

  /** The contract summaries of one customer. */
  async contractsOf(tenantId: string, customerId: string): Promise<DirectoryContract[]> {
    const items = await this.query(tenantId, contractPrefix(customerId));
    return items.map((item) => DirectoryContract.parse(item));
  }

  /** Deletes the customer's profile summary and contract summaries (demo reset). */
  async removeCustomer(tenantId: string, customerId: string): Promise<void> {
    const table = await this.data(tenantId);
    const contracts = await queryKeys(table, directoryPk(tenantId), contractPrefix(customerId));
    await deleteKeys(table, [...contracts, profileKey(tenantId, customerId)]);
  }

  private async query(tenantId: string, skPrefix?: string): Promise<Record<string, unknown>[]> {
    const { db, tableName } = await this.data(tenantId);
    const items: Record<string, unknown>[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const result = await db.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression:
            skPrefix === undefined ? "PK = :pk" : "PK = :pk AND begins_with(SK, :prefix)",
          ExpressionAttributeValues: {
            ":pk": directoryPk(tenantId),
            ...(skPrefix === undefined ? {} : { ":prefix": skPrefix }),
          },
          ExclusiveStartKey: start,
        }),
      );
      items.push(...(result.Items ?? []));
      start = result.LastEvaluatedKey;
    } while (start);
    return items;
  }
}

/** Sorts the partition's items into profile and contracts per customer. */
function group(items: readonly Record<string, unknown>[]): Map<string, DirectoryEntry> {
  const entries = new Map<string, DirectoryEntry>();
  const entry = (customerId: string) => {
    let found = entries.get(customerId);
    if (!found) entries.set(customerId, (found = { contracts: [] }));
    return found;
  };
  for (const item of items) {
    if (typeof item.contractId === "string") {
      const contract = DirectoryContract.safeParse(item);
      if (contract.success) entry(contract.data.customerId).contracts.push(contract.data);
      else log("warn", "Invalid contract summary skipped", { SK: item.SK });
    } else {
      const profile = DirectoryProfile.safeParse(item);
      if (profile.success) entry(profile.data.customerId).profile = profile.data;
      else log("warn", "Invalid profile summary skipped", { SK: item.SK });
    }
  }
  return entries;
}
