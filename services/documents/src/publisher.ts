import { type EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  DocumentUploaded,
  type DocumentUploadedDetail,
  QuotaExceeded,
  type QuotaExceededDetail,
} from "@kundenportal/events";
import type { z } from "zod";

interface EventDefinition<T extends z.ZodType> {
  source: string;
  detailType: string;
  detail: T;
}

/** Publishes document events to the portal's own EventBridge bus (validated first). */
export class DocumentEvents {
  constructor(
    private readonly eventBridge: EventBridgeClient,
    private readonly busName: string,
  ) {}

  async documentUploaded(detail: DocumentUploadedDetail): Promise<void> {
    await this.publish(DocumentUploaded, detail);
  }

  /**
   * The upload quota of a pass is used up. The event belongs to the tenancy domain's
   * contract (source `kundenportal.tenancy`), whose consumers expect it from there; the
   * tenancy worker does not count its own source against the events quota.
   */
  async quotaExceeded(detail: QuotaExceededDetail): Promise<void> {
    await this.publish(QuotaExceeded, detail);
  }

  private async publish<T extends z.ZodType>(
    event: EventDefinition<T>,
    detail: z.input<T>,
  ): Promise<void> {
    const validated = event.detail.parse(detail);
    const result = await this.eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.busName,
            Source: event.source,
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
