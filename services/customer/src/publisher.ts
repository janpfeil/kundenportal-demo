import { type EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { CustomerRegistered, type CustomerRegisteredDetail } from "@kundenportal/events";

/** Publishes customer events to the portal's own EventBridge bus. */
export class CustomerEvents {
  constructor(
    private readonly eventBridge: EventBridgeClient,
    private readonly busName: string,
  ) {}

  async customerRegistered(detail: CustomerRegisteredDetail): Promise<void> {
    const validated = CustomerRegistered.detail.parse(detail);
    const result = await this.eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.busName,
            Source: CustomerRegistered.source,
            DetailType: CustomerRegistered.detailType,
            Detail: JSON.stringify(validated),
          },
        ],
      }),
    );
    if (result.FailedEntryCount) {
      throw new Error(
        `EventBridge rejected CustomerRegistered: ${result.Entries?.[0]?.ErrorCode ?? "unknown"}`,
      );
    }
  }
}
