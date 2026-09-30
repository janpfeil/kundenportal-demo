import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "@kundenportal/service-kit";
import { ContractEvents } from "./publisher.js";
import { ContractRepository } from "./repository.js";
import { ContractService } from "./service.js";

/** Builds the service with real AWS clients, once per execution environment. */
export function createService(): ContractService {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return new ContractService(
    new ContractRepository(db, requireEnv("TABLE_NAME")),
    new ContractEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  );
}
