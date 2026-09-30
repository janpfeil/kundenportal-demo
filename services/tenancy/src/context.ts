import type { TenancyConfig } from "./model.js";
import type {
  ExpirySchedules,
  LegacyTenants,
  OwnerHints,
  TenantAccounts,
  TenantTables,
  TenantUploads,
} from "./ports.js";
import type { EventPublisher } from "./publisher.js";
import type { TenancyRepository } from "./repository.js";

/** The repository as the use cases see it (the tests use an in-memory one). */
export type Repository = Pick<TenancyRepository, keyof TenancyRepository>;

/** Everything the use cases of the tenancy domain work with. */
export interface TenancyContext {
  repository: Repository;
  events: EventPublisher;
  tables: TenantTables;
  accounts: TenantAccounts;
  legacy: LegacyTenants;
  schedules: ExpirySchedules;
  uploads: TenantUploads;
  ownerHints: OwnerHints;
  config: TenancyConfig;
  now: () => Date;
  newId: () => string;
}

export const tableNameOf = (config: TenancyConfig, tenantId: string) =>
  `${config.tablePrefix}${tenantId}`;
