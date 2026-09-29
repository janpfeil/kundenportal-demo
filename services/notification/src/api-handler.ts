import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "@kundenportal/service-kit";
import { createApi } from "./api.js";
import { Mailbox } from "./mailbox.js";

/** Lambda entry point behind the HTTP API (`/notifications`). */
export const handler = createApi(
  new Mailbox(DynamoDBDocumentClient.from(new DynamoDBClient({})), requireEnv("TABLE_NAME")),
);
