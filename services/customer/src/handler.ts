import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "@kundenportal/service-kit";
import { createHandler } from "./app.js";
import { CustomerEvents } from "./publisher.js";
import { CustomerRepository } from "./repository.js";
import { CustomerService } from "./service.js";

/** Lambda entry point: wires AWS clients once per execution environment. */
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const handler = createHandler(
  new CustomerService(
    new CustomerRepository(db, requireEnv("TABLE_NAME")),
    new CustomerEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  ),
);
