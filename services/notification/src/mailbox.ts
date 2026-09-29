import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { tenantKey } from "@kundenportal/service-kit";
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
 */
export class Mailbox {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  async linkSubject(tenantId: string, subject: string, customerId: string): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "MAILBOX", customerId },
      }),
    );
  }

  async customerOf(tenantId: string, subject: string): Promise<string | undefined> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: tenantKey(tenantId, "SUBJ", subject), SK: "MAILBOX" },
      }),
    );
    return result.Item?.customerId as string | undefined;
  }

  /** Stores a notification once; returns `false` if it already existed (redelivery). */
  async add(tenantId: string, customerId: string, notification: Notification): Promise<boolean> {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
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
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.table,
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
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
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
