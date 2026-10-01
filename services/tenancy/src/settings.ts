import { badRequest } from "@kundenportal/service-kit";
import { z } from "zod";
import type { Repository } from "./context.js";
import { MAX_TENANTS_LIMIT, type Settings, type TenancyConfig, UPLOAD_MAX_BYTES } from "./model.js";

/** Body of `PUT /tenancy/settings`; mirrors `SettingsUpdate` in the OpenAPI contract. */
export const SettingsRequest = z.strictObject({
  redemption: z.enum(["open", "closed"]).optional(),
  /** At most 4: the DynamoDB free capacity (see `MAX_TENANTS_LIMIT`). */
  maxTenants: z.number().int().min(1).max(MAX_TENANTS_LIMIT).optional(),
});
export type SettingsRequest = z.infer<typeof SettingsRequest>;

/** `GET/PUT /tenancy/settings` response (`PlatformSettings` in the contract). */
export interface SettingsView {
  redemption: "open" | "closed";
  closedAt?: string;
  closedReason?: string;
  maxTenants: number;
  activeTenants: number;
}

/** `GET /tenancy/offer` response (`PassOffer` in the contract). */
export interface OfferView {
  passHours: number;
  quotas: { api: number; events: number; uploads: number };
  uploadMaxBytes: number;
  /** Redeeming is possible right now: not closed and a pass tenant is free. */
  redemptionOpen: boolean;
}

const view = (settings: Settings): SettingsView => ({
  redemption: settings.redemption,
  ...(settings.closedAt ? { closedAt: settings.closedAt } : {}),
  ...(settings.closedReason ? { closedReason: settings.closedReason } : {}),
  maxTenants: settings.maxTenants,
  activeTenants: Math.max(0, settings.activeTenants ?? 0),
});

/** The owner's platform settings (kill switch, cap) and the public offer. */
export class PlatformSettings {
  constructor(
    private readonly repository: Repository,
    private readonly config: TenancyConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(): Promise<SettingsView> {
    return view(await this.repository.getSettings());
  }

  /** Opens or closes redemption and sets the cap; reopening clears the closing reason. */
  async update(request: SettingsRequest): Promise<SettingsView> {
    if (request.redemption === undefined && request.maxTenants === undefined) {
      throw badRequest("Nothing to change: give redemption or maxTenants");
    }
    return view(await this.repository.updateSettings(request, this.now()));
  }

  /** What a demo pass offers, for the redeem page (public, no personal data). */
  async offer(): Promise<OfferView> {
    const settings = await this.repository.getSettings();
    const { quotas, passHours } = this.config;
    return {
      passHours,
      quotas: { api: quotas.api, events: quotas.events, uploads: quotas.uploads },
      uploadMaxBytes: UPLOAD_MAX_BYTES,
      redemptionOpen:
        settings.redemption === "open" && (settings.activeTenants ?? 0) < settings.maxTenants,
    };
  }
}
