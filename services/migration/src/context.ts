import type { LegacyAccountRef } from "@kundenportal/events";
import {
  type LegacyAccess,
  type MappingResult,
  mapTelcoSubscriber,
  mapUtilityCustomer,
} from "@kundenportal/legacy";
import type { TenantStatusLookup } from "@kundenportal/service-kit";
import type { AccountProvisioner } from "./accounts.js";
import type { Corrections } from "./model.js";
import type { DeadLetters, RecordDispatcher } from "./ports.js";
import type { MigrationEvents } from "./publisher.js";
import type { MigrationRepository } from "./repository.js";

/** Everything the use cases of the migration domain work with. */
export interface MigrationContext {
  repository: MigrationRepository;
  events: MigrationEvents;
  legacy: () => Promise<LegacyAccess>;
  accounts: AccountProvisioner;
  dispatcher: RecordDispatcher;
  deadLetters: DeadLetters;
  /** Platform status of the tenants (demo passes come and go). */
  tenants: TenantStatusLookup;
  now: () => Date;
  newId: () => string;
}

/** Reads one legacy record fresh and maps it (with operator corrections). */
export async function readRecord(
  legacy: LegacyAccess,
  tenantId: string,
  account: LegacyAccountRef,
  corrections: Corrections = {},
): Promise<MappingResult | undefined> {
  if (account.system === "utility") {
    const kunde = await legacy.utility.getCustomer(tenantId, account.customerNumber);
    return kunde && mapUtilityCustomer(kunde, corrections);
  }
  const subscriber = await legacy.telco.getSubscriber(tenantId, account.customerNumber);
  return subscriber && mapTelcoSubscriber(subscriber, corrections);
}

/** Reads the complete export of a legacy system, mapped (a few pages in the demo). */
export async function readExport(
  legacy: LegacyAccess,
  tenantId: string,
  system: LegacyAccountRef["system"],
): Promise<MappingResult[]> {
  const results: MappingResult[] = [];
  if (system === "utility") {
    for (let page = 1; ; page++) {
      const { kunden, gesamt, groesse } = await legacy.utility.exportPage(tenantId, page, 50);
      results.push(...kunden.map((kunde) => mapUtilityCustomer(kunde)));
      if (kunden.length === 0 || page * groesse >= gesamt) break;
    }
    return results;
  }
  let offset: number | null = 0;
  while (offset !== null) {
    const slice = await legacy.telco.exportSlice(tenantId, offset, 50);
    results.push(...slice.items.map((item) => mapTelcoSubscriber(item)));
    offset = slice.items.length === 0 ? null : slice.nextOffset;
  }
  return results;
}

/** Number of records in a legacy system, or undefined while it is unreachable. */
export async function legacyTotal(
  legacy: LegacyAccess,
  tenantId: string,
  system: LegacyAccountRef["system"],
): Promise<number | undefined> {
  try {
    return system === "utility"
      ? (await legacy.utility.exportPage(tenantId, 1, 1)).gesamt
      : (await legacy.telco.exportSlice(tenantId, 0, 1)).total;
  } catch {
    return undefined;
  }
}
