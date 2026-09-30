import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { cachedLegacyAccess } from "@kundenportal/legacy";
import { requireEnv } from "@kundenportal/service-kit";
import { AnnouncementRepository } from "./announcements.js";
import { type Announce, createAnnouncer } from "./announce.js";
import { IdentityEvents } from "./publisher.js";

/** Builds the announcer with real AWS clients, once per execution environment. */
export function createAnnouncerFromEnvironment(): Announce {
  return createAnnouncer({
    access: cachedLegacyAccess(new SSMClient({})),
    announcements: new AnnouncementRepository(
      DynamoDBDocumentClient.from(new DynamoDBClient({})),
      requireEnv("TABLE_NAME"),
    ),
    events: new IdentityEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  });
}
