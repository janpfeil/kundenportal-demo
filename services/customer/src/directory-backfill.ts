import type { ContractSnapshot } from "@kundenportal/events";
import {
  log,
  type Pace,
  scanTenant,
  tenantKey,
  type TenantDataSource,
  writePacer,
} from "@kundenportal/service-kit";
import type { Clock } from "./service.js";
import { contractSummary, profileSummary } from "./directory.js";
import { type CustomerRepository, type ProfileRecord, profileRecord } from "./repository.js";

export interface CustomerBackfillOptions {
  /** Read pace of the scan; default 100 items per page, 1 s apart. */
  pace?: Pace;
  /** Writes per second at most; default 2 (the table has 5 write units). */
  writesPerSecond?: number;
  clock?: Clock;
  /** Replaceable in tests (with `now`, which the pause moves on). */
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface CustomerBackfill {
  /** Profiles of the tenant, test accounts included. */
  profiles: number;
  /** Profiles this run added to the directory (2 writes each). */
  addedProfiles: number;
  /** Contract summaries this run added or brought to a newer version (1 write each). */
  addedContracts: number;
  /** When an earlier run finished, if one did; this run then wrote nothing. */
  finishedBefore?: string;
}

/**
 * One-off backfill of the customer directory (phase 7, §3.7): every profile from before
 * phase 7 gets its summary and mark, as its next `/me` would give it, and every contract
 * gets its summary from the contract domain's snapshot, as its next `ContractChanged` would.
 * Reads the directory once and the profiles with a paced Scan, writes only what is missing
 * or older, spaced; a finished run leaves a mark and is not repeated.
 */
export async function backfillCustomerDirectory(
  data: TenantDataSource,
  repository: CustomerRepository,
  tenantId: string,
  contracts: readonly ContractSnapshot[],
  options: CustomerBackfillOptions = {},
): Promise<CustomerBackfill> {
  const finishedBefore = await repository.backfillFinished(tenantId);
  if (finishedBefore) {
    log("info", "Customer directory backfilled before", { tenantId, finishedBefore });
    return { profiles: 0, addedProfiles: 0, addedContracts: 0, finishedBefore };
  }
  const now = options.clock?.now() ?? new Date();
  const pace = writePacer(options.writesPerSecond ?? 2, options.wait, options.now);
  const directory = await repository.directory.entries(tenantId);

  const profiles: ProfileRecord[] = [];
  for await (const page of scanTenant(await data(tenantId), tenantKey(tenantId, "CUST"), {
    ...options.pace,
    ...(options.wait ? { sleep: options.wait } : {}),
  })) {
    for (const item of page) {
      if (item.SK !== "PROFILE") continue;
      try {
        profiles.push(profileRecord(item));
      } catch {
        log("warn", "Unreadable profile skipped", { tenantId, pk: String(item.PK) });
      }
    }
  }

  let addedProfiles = 0;
  for (const record of profiles) {
    const { customerId } = record.customer;
    if (record.listed && directory.get(customerId)?.profile) continue;
    await pace();
    await repository.directory.putProfile(tenantId, profileSummary(record.customer), record.rev);
    await pace();
    await repository.markListed(tenantId, customerId);
    addedProfiles += 1;
  }

  let addedContracts = 0;
  for (const snapshot of contracts) {
    const known = directory
      .get(snapshot.customerId)
      ?.contracts.find((contract) => contract.contractId === snapshot.contractId);
    if (known && known.version >= snapshot.version) continue;
    await pace();
    if (await repository.directory.putContract(tenantId, contractSummary(snapshot))) {
      addedContracts += 1;
    }
  }

  await repository.markBackfillFinished(tenantId, {
    finishedAt: now.toISOString(),
    profiles: profiles.length,
    addedProfiles,
    addedContracts,
  });
  log("info", "Customer directory backfilled", {
    tenantId,
    profiles: profiles.length,
    addedProfiles,
    addedContracts,
  });
  return { profiles: profiles.length, addedProfiles, addedContracts };
}
