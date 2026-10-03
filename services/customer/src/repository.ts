import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { deleteKeys, tenantKey, type TenantDataSource } from "@kundenportal/service-kit";
import type { PostalAddress } from "@kundenportal/events";
import { Customer, type CustomerUpdate } from "./customer.js";
import { profileSummary } from "./directory.js";
import { DirectoryRepository, profileItem } from "./directory-repository.js";

/**
 * A stored profile with its bookkeeping: `rev` counts the changes (the directory keeps
 * the summary of the highest), `listed` says the directory has a summary of it — missing
 * on profiles from before phase 7 until their next read or change. `announced` says
 * `CustomerRegistered` went out after every consuming domain existed — missing on
 * profiles from before that marker until their next read.
 */
export interface ProfileRecord {
  customer: Customer;
  rev: number;
  listed: boolean;
  announced: boolean;
}

export function profileRecord(item: Record<string, unknown>): ProfileRecord {
  return {
    customer: Customer.parse(item),
    rev: typeof item.rev === "number" ? item.rev : 0,
    listed: item.listed === true,
    announced: item.announced === true,
  };
}

/** Mark of the one-off directory backfill (version 1) of a tenant. */
const backfillKey = (tenantId: string) => ({
  PK: tenantKey(tenantId, "BACKFILL"),
  SK: "CUSTOMERS#v1",
});

/** Every change of the profile counts up `rev` and marks it as listed in the directory. */
const REVISED_NAMES = { "#listed": "listed", "#rev": "rev" };
const REVISED_VALUES = { ":true": true, ":one": 1 };

/**
 * Items of the customer domain in the single table (see fachkonzept §7.1):
 * - `TENANT#<t>#CUST#<customerId>` / `PROFILE` — the profile
 * - `TENANT#<t>#SUBJ#<subject>` / `CUSTOMER` — which customer a sign-in identity belongs to
 * - `TENANT#<t>#BACKFILL` / `CUSTOMERS#v1` — when the one-off directory backfill finished
 * - the operator's customer directory, see `DirectoryRepository`
 */
export class CustomerRepository {
  readonly directory: DirectoryRepository;

  constructor(private readonly data: TenantDataSource) {
    this.directory = new DirectoryRepository(data);
  }

  async findBySubject(tenantId: string, subject: string): Promise<ProfileRecord | undefined> {
    const customerId = await this.customerIdOf(tenantId, subject);
    return customerId ? this.get(tenantId, customerId) : undefined;
  }

  /** The customer a sign-in identity belongs to, from the identity link. */
  async customerIdOf(tenantId: string, subject: string): Promise<string | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const link = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "CUSTOMER" },
        ConsistentRead: true,
      }),
    );
    return link.Item?.customerId as string | undefined;
  }

  async get(tenantId: string, customerId: string): Promise<ProfileRecord | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: tenantKey(tenantId, "CUST", customerId), SK: "PROFILE" },
        ConsistentRead: true,
      }),
    );
    return result.Item ? profileRecord(result.Item) : undefined;
  }

  /**
   * Creates profile, identity link and directory summary atomically. Returns `false` if
   * another request created the link first (concurrent first sign-in); nothing is
   * written then.
   */
  async create(tenantId: string, subject: string, customer: Customer): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName,
                Item: {
                  PK: tenantKey(tenantId, "SUBJ", subject),
                  SK: "CUSTOMER",
                  customerId: customer.customerId,
                },
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
            {
              Put: {
                TableName: tableName,
                Item: {
                  PK: tenantKey(tenantId, "CUST", customer.customerId),
                  SK: "PROFILE",
                  ...customer,
                  ...(customer.legacyAccounts
                    ? { legacyAccounts: new Set(customer.legacyAccounts) }
                    : {}),
                  rev: 1,
                  listed: true,
                  announced: true,
                },
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
            {
              Put: {
                TableName: tableName,
                Item: profileItem(tenantId, profileSummary(customer), 1),
              },
            },
          ],
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof TransactionCanceledException) return false;
      throw error;
    }
  }

  async update(
    tenantId: string,
    customerId: string,
    update: CustomerUpdate,
  ): Promise<ProfileRecord> {
    const { db, tableName } = await this.data(tenantId);
    const fields = Object.entries(update).filter(([, value]) => value !== undefined);
    const sets = [...fields.map(([name]) => `#${name} = :${name}`), "#listed = :true"];
    try {
      const result = await db.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: tenantKey(tenantId, "CUST", customerId), SK: "PROFILE" },
          UpdateExpression: `SET ${sets.join(", ")} ADD #rev :one`,
          ExpressionAttributeNames: {
            ...Object.fromEntries(fields.map(([name]) => [`#${name}`, name])),
            ...REVISED_NAMES,
          },
          ExpressionAttributeValues: {
            ...Object.fromEntries(fields.map(([name, value]) => [`:${name}`, value])),
            ...REVISED_VALUES,
          },
          ConditionExpression: "attribute_exists(PK)",
          ReturnValues: "ALL_NEW",
        }),
      );
      return profileRecord(result.Attributes ?? {});
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new Error(`Customer ${customerId} vanished during update`, { cause: error });
      }
      throw error;
    }
  }

  /**
   * Adds data from a legacy system: address and phone only where the profile has none
   * yet, the legacy account to the set of accounts (idempotent). Returns the profile.
   */
  async addLegacyData(
    tenantId: string,
    customerId: string,
    data: { address?: PostalAddress; phone?: string; legacyAccount: string },
  ): Promise<ProfileRecord> {
    const { db, tableName } = await this.data(tenantId);
    const sets = [
      ...(data.address ? ["#address = if_not_exists(#address, :address)"] : []),
      ...(data.phone ? ["#phone = if_not_exists(#phone, :phone)"] : []),
      "#listed = :true",
    ];
    const result = await db.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: tenantKey(tenantId, "CUST", customerId), SK: "PROFILE" },
        UpdateExpression: `SET ${sets.join(", ")} ADD #legacyAccounts :account, #rev :one`,
        // Aliases throughout: DynamoDB rejects reserved words in expressions.
        ExpressionAttributeNames: {
          "#legacyAccounts": "legacyAccounts",
          ...(data.address ? { "#address": "address" } : {}),
          ...(data.phone ? { "#phone": "phone" } : {}),
          ...REVISED_NAMES,
        },
        ExpressionAttributeValues: {
          ":account": new Set([data.legacyAccount]),
          ...(data.address ? { ":address": data.address } : {}),
          ...(data.phone ? { ":phone": data.phone } : {}),
          ...REVISED_VALUES,
        },
        ConditionExpression: "attribute_exists(PK)",
        ReturnValues: "ALL_NEW",
      }),
    );
    return profileRecord(result.Attributes ?? {});
  }

  /** Notes that the directory has a summary of a profile from before phase 7 (backfill). */
  async markListed(tenantId: string, customerId: string): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: tenantKey(tenantId, "CUST", customerId), SK: "PROFILE" },
        UpdateExpression: "SET #listed = :true",
        ExpressionAttributeNames: { "#listed": "listed" },
        ExpressionAttributeValues: { ":true": true },
        ConditionExpression: "attribute_exists(PK)",
      }),
    );
  }

  /** Notes that `CustomerRegistered` of a profile from before the marker went out again. */
  async markAnnounced(tenantId: string, customerId: string): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: tenantKey(tenantId, "CUST", customerId), SK: "PROFILE" },
        UpdateExpression: "SET #announced = :true",
        ExpressionAttributeNames: { "#announced": "announced" },
        ExpressionAttributeValues: { ":true": true },
        ConditionExpression: "attribute_exists(PK)",
      }),
    );
  }

  /** When the one-off directory backfill of a tenant finished, if it did (§3.7). */
  async backfillFinished(tenantId: string): Promise<string | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({ TableName: tableName, Key: backfillKey(tenantId), ConsistentRead: true }),
    );
    return typeof result.Item?.finishedAt === "string" ? result.Item.finishedAt : undefined;
  }

  /** Notes that the backfill of a tenant is complete, with what it added. */
  async markBackfillFinished(
    tenantId: string,
    result: { finishedAt: string; profiles: number; addedProfiles: number; addedContracts: number },
  ): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({ TableName: tableName, Item: { ...backfillKey(tenantId), ...result } }),
    );
  }

  /** Deletes profile and identity link (removed account); nothing left is no error. */
  async remove(tenantId: string, subject: string, customerId: string): Promise<void> {
    await deleteKeys(await this.data(tenantId), [
      { PK: tenantKey(tenantId, "CUST", customerId), SK: "PROFILE" },
      { PK: tenantKey(tenantId, "SUBJ", subject), SK: "CUSTOMER" },
    ]);
  }
}
