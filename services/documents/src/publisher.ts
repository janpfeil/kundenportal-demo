import { type EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { DocumentUploaded, type DocumentUploadedDetail } from "@kundenportal/events";

/** Publishes document events to the portal's own EventBridge bus (validated first). */
export class DocumentEvents {
  constructor(
    private readonly eventBridge: EventBridgeClient,
    private readonly busName: string,
  ) {}

  async documentUploaded(detail: DocumentUploadedDetail): Promise<void> {
    const validated = DocumentUploaded.detail.parse(detail);
    const result = await this.eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.busName,
            Source: DocumentUploaded.source,
            DetailType: DocumentUploaded.detailType,
            Detail: JSON.stringify(validated),
          },
        ],
      }),
    );
    if (result.FailedEntryCount) {
      throw new Error(
        `EventBridge rejected DocumentUploaded: ${result.Entries?.[0]?.ErrorCode ?? "unknown"}`,
      );
    }
  }
}
