import { type EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  DataVolumeThresholdReached,
  type DataVolumeThresholdReachedDetail,
  MeterReadingSubmitted,
  type MeterReadingSubmittedDetail,
} from "@kundenportal/events";

/** Publishes consumption events to the portal's own EventBridge bus (validated first). */
export class ConsumptionEvents {
  constructor(
    private readonly eventBridge: EventBridgeClient,
    private readonly busName: string,
  ) {}

  async meterReadingSubmitted(detail: MeterReadingSubmittedDetail): Promise<void> {
    await this.put(
      MeterReadingSubmitted.source,
      MeterReadingSubmitted.detailType,
      MeterReadingSubmitted.detail.parse(detail),
    );
  }

  async dataVolumeThresholdReached(detail: DataVolumeThresholdReachedDetail): Promise<void> {
    await this.put(
      DataVolumeThresholdReached.source,
      DataVolumeThresholdReached.detailType,
      DataVolumeThresholdReached.detail.parse(detail),
    );
  }

  private async put(source: string, detailType: string, detail: unknown): Promise<void> {
    const result = await this.eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.busName,
            Source: source,
            DetailType: detailType,
            Detail: JSON.stringify(detail),
          },
        ],
      }),
    );
    if (result.FailedEntryCount) {
      throw new Error(
        `EventBridge rejected ${detailType}: ${result.Entries?.[0]?.ErrorCode ?? "unknown"}`,
      );
    }
  }
}
