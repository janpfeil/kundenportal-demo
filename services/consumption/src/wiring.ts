import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { requireEnv, tenantData } from "@kundenportal/service-kit";
import { ConsumptionEvents } from "./publisher.js";
import { ConsumptionRepository } from "./repository.js";
import { ConsumptionService } from "./service.js";

/**
 * Builds the service with real AWS clients, once per execution environment; the
 * repository resolves each tenant's table and credentials per call (`tenantData`).
 */
export function createService(): ConsumptionService {
  return new ConsumptionService(
    new ConsumptionRepository(tenantData),
    new ConsumptionEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  );
}
