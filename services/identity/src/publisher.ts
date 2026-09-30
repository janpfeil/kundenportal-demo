import { type EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  EventSource,
  LegacyAccountMigrated,
  type LegacyAccountMigratedDetail,
} from "@kundenportal/events";

/** Publishes identity events to the portal's own EventBridge bus. */
export class IdentityEvents {
  constructor(
    private readonly eventBridge: EventBridgeClient,
    private readonly busName: string,
  ) {}

  async legacyAccountMigrated(detail: LegacyAccountMigratedDetail): Promise<void> {
    const validated = LegacyAccountMigrated.detail.parse(detail);
    const result = await this.eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.busName,
            Source: EventSource.identity,
            DetailType: LegacyAccountMigrated.detailType,
            Detail: JSON.stringify(validated),
          },
        ],
      }),
    );
    if (result.FailedEntryCount) {
      throw new Error(
        `EventBridge rejected LegacyAccountMigrated: ${result.Entries?.[0]?.ErrorCode ?? "unknown"}`,
      );
    }
  }
}
