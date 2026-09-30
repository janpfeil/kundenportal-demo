import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SSMClient } from "@aws-sdk/client-ssm";
import { cachedLegacyAccess } from "@kundenportal/legacy";
import { requireEnv, tenantData } from "@kundenportal/service-kit";
import { AnnouncementRepository } from "./announcements.js";
import { type Announce, createAnnouncer } from "./announce.js";
import { IdentityEvents } from "./publisher.js";

/** Builds the announcer with real AWS clients, once per execution environment. */
export function createAnnouncerFromEnvironment(): Announce {
  return createAnnouncer({
    access: cachedLegacyAccess(new SSMClient({})),
    announcements: new AnnouncementRepository(tenantData),
    events: new IdentityEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  });
}
