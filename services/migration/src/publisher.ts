import { type EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { EventSource } from "@kundenportal/events";
import type { z } from "zod";

interface EventDefinition<T extends z.ZodType> {
  detailType: string;
  detail: T;
}

/** Publishes migration events to the portal's own EventBridge bus (source `kundenportal.migration`). */
export class MigrationEvents {
  constructor(
    private readonly eventBridge: EventBridgeClient,
    private readonly busName: string,
  ) {}

  async publish<T extends z.ZodType>(event: EventDefinition<T>, detail: z.input<T>): Promise<void> {
    const validated = event.detail.parse(detail);
    const result = await this.eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.busName,
            Source: EventSource.migration,
            DetailType: event.detailType,
            Detail: JSON.stringify(validated),
          },
        ],
      }),
    );
    if (result.FailedEntryCount) {
      throw new Error(
        `EventBridge rejected ${event.detailType}: ${result.Entries?.[0]?.ErrorCode ?? "unknown"}`,
      );
    }
  }
}
