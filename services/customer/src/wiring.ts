import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { requireEnv, tenantData } from "@kundenportal/service-kit";
import { CustomerEvents } from "./publisher.js";
import { CustomerRepository } from "./repository.js";
import { CustomerService } from "./service.js";

/**
 * Builds the service with real AWS clients, once per execution environment; the
 * repository resolves each tenant's table and credentials per call (`tenantData`).
 */
export function createService(): CustomerService {
  return new CustomerService(
    new CustomerRepository(tenantData),
    new CustomerEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  );
}
