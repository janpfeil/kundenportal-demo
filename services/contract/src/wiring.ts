import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { requireEnv, type TenantDataSource, tenantData } from "@kundenportal/service-kit";
import { BackOffice } from "./back-office.js";
import { ProductCatalogue } from "./catalogue.js";
import { type Clock, systemClock } from "./clock.js";
import { ContractIntake } from "./intake.js";
import { ProductRepository } from "./product-repository.js";
import { ContractEvents } from "./publisher.js";
import { ContractRepository } from "./repository.js";
import { ContractService } from "./service.js";

/** The contract domain's use cases: customers, operator, catalogue and the worker's. */
export interface ContractDomain {
  customers: ContractService;
  operator: BackOffice;
  catalogue: ProductCatalogue;
  intake: ContractIntake;
}

export function buildDomain(
  data: TenantDataSource,
  events: ContractEvents,
  clock: Clock = systemClock,
): ContractDomain {
  const contracts = new ContractRepository(data);
  const catalogue = new ProductCatalogue(new ProductRepository(data), contracts, events, clock);
  return {
    customers: new ContractService(contracts, events, catalogue, clock),
    operator: new BackOffice(contracts, events, catalogue, clock),
    catalogue,
    intake: new ContractIntake(contracts, events, catalogue, clock),
  };
}

/**
 * Builds the domain with real AWS clients, once per execution environment; the
 * repositories resolve each tenant's table and credentials per call (`tenantData`).
 */
export function createDomain(): ContractDomain {
  return buildDomain(
    tenantData,
    new ContractEvents(new EventBridgeClient({}), requireEnv("EVENT_BUS_NAME")),
  );
}
