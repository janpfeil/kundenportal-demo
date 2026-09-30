import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "@kundenportal/service-kit";
import { CustomerEvents } from "./publisher.js";
import { CustomerRepository } from "./repository.js";
import { CustomerService } from "./service.js";

/** Builds the service with real AWS clients, once per execution environment. */
export function createService(): CustomerService {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return new CustomerService(
    new CustomerRepository(db, requireEnv("TABLE_NAME")),
    new CustomerEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  );
}
