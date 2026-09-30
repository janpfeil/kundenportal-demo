import { type EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { EventSource } from "@kundenportal/events";
import type { z } from "zod";

interface EventDefinition<T extends z.ZodType> {
  detailType: string;
  detail: T;
}

/** Where events go; the tests collect them in memory. */
export interface EventPublisher {
  publish<T extends z.ZodType>(event: EventDefinition<T>, detail: z.input<T>): Promise<void>;
}

/** Publishes tenancy events to the portal's own bus (source `kundenportal.tenancy`). */
export class TenancyEvents implements EventPublisher {
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
            Source: EventSource.tenancy,
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
