import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Locale } from "@kundenportal/events";
import { tenantKey, type TenantDataSource } from "@kundenportal/service-kit";
import { z } from "zod";

export const Notification = z.object({
  notificationId: z.string(),
  kind: z.enum(["welcome", "info", "warning"]),
  title: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  read: z.boolean(),
});
export type Notification = z.infer<typeof Notification>;

const PAGE_SIZE = 50;
const ID_PATTERN = /^[0-9a-z]{9}-[0-9a-f-]{36}$/;

/**
 * Sortable, idempotent notification id: creation time (base 36, fixed width) plus the id
 * of the event that caused it. Redelivered events therefore map to the same item.
 */
export function notificationId(createdAt: string, eventId: string): string {
  return `${Date.parse(createdAt).toString(36).padStart(9, "0")}-${eventId}`;
}

export function isNotificationId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/**
 * Items of the notification domain in the single table:
 * - `TENANT#<t>#CUST#<customerId>` / `NOTE#<notificationId>` — mailbox entries
 * - `TENANT#<t>#SUBJ#<subject>` / `MAILBOX` — own projection from events: whose mailbox
 *   a sign-in identity opens (the service never reads the customer domain's items)
 * - `TENANT#<t>#CUST#<customerId>` / `MAILBOX` — own projection from `CustomerRegistered`:
 *   the language the mailbox writes in (events of other domains carry no language)
 */
export class Mailbox {
  constructor(private readonly data: TenantDataSource) {}

  async rememberLocale(tenantId: string, customerId: string, locale: Locale): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: { PK: tenantKey(tenantId, "CUST", customerId), SK: "MAILBOX", locale },
      }),
    );
  }

  /** Language of the customer's mailbox; German if the customer is not known (yet). */
  async localeOf(tenantId: string, customerId: string): Promise<Locale> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: tenantKey(tenantId, "CUST", customerId), SK: "MAILBOX" },
      }),
    );
    const parsed = Locale.safeParse(result.Item?.locale);
    return parsed.success ? parsed.data : "de";
  }

  async linkSubject(tenantId: string, subject: string, customerId: string): Promise<void> {
    const { db, tableName } = await this.data(tenantId);
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "MAILBOX", customerId },
      }),
    );
  }

  async customerOf(tenantId: string, subject: string): Promise<string | undefined> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "MAILBOX" },
      }),
    );
    return result.Item?.customerId as string | undefined;
  }

  /** Stores a notification once; returns `false` if it already existed (redelivery). */
  async add(tenantId: string, customerId: string, notification: Notification): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: tenantKey(tenantId, "CUST", customerId),
            SK: `NOTE#${notification.notificationId}`,
            ...notification,
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

  async list(tenantId: string, customerId: string): Promise<Notification[]> {
    const { db, tableName } = await this.data(tenantId);
    const result = await db.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :note)",
        ExpressionAttributeValues: {
          ":pk": tenantKey(tenantId, "CUST", customerId),
          ":note": "NOTE#",
        },
        ScanIndexForward: false,
        Limit: PAGE_SIZE,
      }),
    );
    return (result.Items ?? []).map((item) => Notification.parse(item));
  }

  /** Marks a notification as read; returns `false` if it does not exist for this customer. */
  async markRead(tenantId: string, customerId: string, id: string): Promise<boolean> {
    const { db, tableName } = await this.data(tenantId);
    try {
      await db.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: tenantKey(tenantId, "CUST", customerId), SK: `NOTE#${id}` },
          UpdateExpression: "SET #read = :true",
          ExpressionAttributeNames: { "#read": "read" },
          ExpressionAttributeValues: { ":true": true },
          ConditionExpression: "attribute_exists(PK)",
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }
}
