import { SNSClient } from "@aws-sdk/client-sns";
import { requireEnv, tenantData } from "@kundenportal/service-kit";
import { createConsumer } from "./consumer.js";
import { Mailbox } from "./mailbox.js";
import { OwnerHints } from "./owner-hints.js";

/** Lambda entry point behind the SQS queue that receives domain events from EventBridge. */
export const handler = createConsumer(
  new Mailbox(tenantData),
  new OwnerHints(new SNSClient({}), requireEnv("OWNER_TOPIC_ARN")),
);
