import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
  type DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { tenantKey } from "@kundenportal/service-kit";
import { Customer, type CustomerUpdate } from "./customer.js";

/**
 * Items of the customer domain in the single table (see fachkonzept §7.1):
 * - `TENANT#<t>#CUST#<customerId>` / `PROFILE` — the profile
 * - `TENANT#<t>#SUBJ#<subject>` / `CUSTOMER` — which customer a sign-in identity belongs to
 */
export class CustomerRepository {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  async findBySubject(tenantId: string, subject: string): Promise<Customer | undefined> {
    const link = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "CUSTOMER" },
        ConsistentRead: true,
      }),
    );
    const customerId = link.Item?.customerId as string | undefined;
    return customerId ? this.get(tenantId, customerId) : undefined;
  }

  async get(tenantId: string, customerId: string): Promise<Customer | undefined> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: tenantKey(tenantId, "CUST", customerId), SK: "PROFILE" },
        ConsistentRead: true,
      }),
    );
    return result.Item ? Customer.parse(result.Item) : undefined;
  }

  /**
   * Creates profile and identity link atomically. Returns `false` if another request
   * created the link first (concurrent first sign-in); nothing is written then.
   */
  async create(tenantId: string, subject: string, customer: Customer): Promise<boolean> {
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
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
                TableName: this.table,
                Item: {
                  PK: tenantKey(tenantId, "CUST", customer.customerId),
                  SK: "PROFILE",
                  ...customer,
                },
                ConditionExpression: "attribute_not_exists(PK)",
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

  async update(tenantId: string, customerId: string, update: CustomerUpdate): Promise<Customer> {
    const fields = Object.entries(update).filter(([, value]) => value !== undefined);
    try {
      const result = await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: tenantKey(tenantId, "CUST", customerId), SK: "PROFILE" },
          UpdateExpression: `SET ${fields.map(([name]) => `#${name} = :${name}`).join(", ")}`,
          ExpressionAttributeNames: Object.fromEntries(fields.map(([name]) => [`#${name}`, name])),
          ExpressionAttributeValues: Object.fromEntries(
            fields.map(([name, value]) => [`:${name}`, value]),
          ),
          ConditionExpression: "attribute_exists(PK)",
          ReturnValues: "ALL_NEW",
        }),
      );
      return Customer.parse(result.Attributes);
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new Error(`Customer ${customerId} vanished during update`, { cause: error });
      }
      throw error;
    }
  }
}
