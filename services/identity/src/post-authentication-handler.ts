import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { requireEnv } from "@kundenportal/service-kit";
import { AnnouncementRepository } from "./announcements.js";
import { type LegacyAccess, loadLegacyAccess } from "@kundenportal/legacy";
import { createHandler } from "./post-authentication.js";
import { IdentityEvents } from "./publisher.js";

let access: Promise<LegacyAccess> | undefined;

export const handler = createHandler({
  access: () => (access ??= loadLegacyAccess(new SSMClient({}))),
  announcements: new AnnouncementRepository(
    DynamoDBDocumentClient.from(new DynamoDBClient({})),
    requireEnv("TABLE_NAME"),
  ),
  events: new IdentityEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
});
