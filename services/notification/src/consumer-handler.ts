import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SNSClient } from "@aws-sdk/client-sns";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "@kundenportal/service-kit";
import { createConsumer } from "./consumer.js";
import { Mailbox } from "./mailbox.js";
import { OwnerHints } from "./owner-hints.js";

/** Lambda entry point behind the SQS queue that receives domain events from EventBridge. */
export const handler = createConsumer(
  new Mailbox(DynamoDBDocumentClient.from(new DynamoDBClient({})), requireEnv("TABLE_NAME")),
  new OwnerHints(new SNSClient({}), requireEnv("OWNER_TOPIC_ARN")),
);
