import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { requireEnv, tenantData } from "@kundenportal/service-kit";
import { ContractEvents } from "./publisher.js";
import { ContractRepository } from "./repository.js";
import { ContractService } from "./service.js";

/**
 * Builds the service with real AWS clients, once per execution environment; the
 * repository resolves each tenant's table and credentials per call (`tenantData`).
 */
export function createService(): ContractService {
  return new ContractService(
    new ContractRepository(tenantData),
    new ContractEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  );
}
