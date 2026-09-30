import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "@kundenportal/service-kit";
import { ConsumptionEvents } from "./publisher.js";
import { ConsumptionRepository } from "./repository.js";
import { ConsumptionService } from "./service.js";

/** Builds the service with real AWS clients, once per execution environment. */
export function createService(): ConsumptionService {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return new ConsumptionService(
    new ConsumptionRepository(db, requireEnv("TABLE_NAME")),
    new ConsumptionEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  );
}
