import { type EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  ContractChanged,
  type ContractChangedDetail,
  InstallmentAdjusted,
  type InstallmentAdjustedDetail,
  ProductChanged,
  type ProductChangedDetail,
} from "@kundenportal/events";

type Entry = { source: string; detailType: string; detail: unknown };

/** Publishes contract events to the portal's own EventBridge bus (validated first). */
export class ContractEvents {
  constructor(
    private readonly eventBridge: EventBridgeClient,
    private readonly busName: string,
  ) {}

  async contractChanged(...details: ContractChangedDetail[]): Promise<void> {
    await this.put(
      details.map((detail) => ({
        source: ContractChanged.source,
        detailType: ContractChanged.detailType,
        detail: ContractChanged.detail.parse(detail),
      })),
    );
  }

  async installmentAdjusted(detail: InstallmentAdjustedDetail): Promise<void> {
    await this.put([
      {
        source: InstallmentAdjusted.source,
        detailType: InstallmentAdjusted.detailType,
        detail: InstallmentAdjusted.detail.parse(detail),
      },
    ]);
  }

  async productChanged(detail: ProductChangedDetail): Promise<void> {
    await this.put([
      {
        source: ProductChanged.source,
        detailType: ProductChanged.detailType,
        detail: ProductChanged.detail.parse(detail),
      },
    ]);
  }

  private async put(entries: Entry[]): Promise<void> {
    if (entries.length === 0) return;
    const result = await this.eventBridge.send(
      new PutEventsCommand({
        Entries: entries.map((entry) => ({
          EventBusName: this.busName,
          Source: entry.source,
          DetailType: entry.detailType,
          Detail: JSON.stringify(entry.detail),
        })),
      }),
    );
    if (result.FailedEntryCount) {
      const codes = (result.Entries ?? []).map((e) => e.ErrorCode).filter(Boolean);
      throw new Error(`EventBridge rejected contract events: ${codes.join(", ") || "unknown"}`);
    }
  }
}
