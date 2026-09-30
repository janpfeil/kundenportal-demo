import { randomUUID } from "node:crypto";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { SQSClient } from "@aws-sdk/client-sqs";
import { SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { type LegacyAccess, loadLegacyAccess } from "@kundenportal/legacy";
import { requireEnv } from "@kundenportal/service-kit";
import { AccountProvisioner } from "./accounts.js";
import { BulkImport } from "./bulk.js";
import { Cockpit } from "./cockpit.js";
import type { MigrationContext } from "./context.js";
import { Linking } from "./links.js";
import { LambdaDispatcher, SqsDeadLetters } from "./ports.js";
import { MigrationEvents } from "./publisher.js";
import { MigrationRepository } from "./repository.js";

let access: Promise<LegacyAccess> | undefined;

/** Builds the use cases with real AWS clients, once per execution environment. */
export function createUseCases() {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const ctx: MigrationContext = {
    repository: new MigrationRepository(db, requireEnv("TABLE_NAME")),
    events: new MigrationEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
    // Outside Cognito's trigger deadline the legacy systems may take longer.
    legacy: () => (access ??= loadLegacyAccess(new SSMClient({}), 5000)),
    accounts: new AccountProvisioner(
      new CognitoIdentityProviderClient({}),
      requireEnv("USER_POOL_ID"),
    ),
    dispatcher: new LambdaDispatcher(new LambdaClient({}), requireEnv("PROCESSOR_FUNCTION_NAME")),
    deadLetters: new SqsDeadLetters(new SQSClient({}), requireEnv("MIGRATION_DLQ_URL")),
    now: () => new Date(),
    newId: randomUUID,
  };
  return { bulk: new BulkImport(ctx), linking: new Linking(ctx), cockpit: new Cockpit(ctx) };
}
