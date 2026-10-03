import {
  log,
  type Pace,
  scanTenant,
  tenantKey,
  type TenantDataSource,
  writePacer,
} from "@kundenportal/service-kit";
import type { ConsumptionRepository } from "./repository.js";

export interface IndexBackfillOptions {
  /** Read pace of the scan; default 100 items per page, 1 s apart. */
  pace?: Pace;
  /** Writes per second at most; default 2 (the table has 5 write units). */
  writesPerSecond?: number;
  now?: () => Date;
  /** Replaceable in tests (with `clock`, which the pause moves on). */
  wait?: (ms: number) => Promise<void>;
  clock?: () => number;
}

/**
 * One-off backfill of the customer index (`TENANT#<t>#CUST#<customerId>` /
 * `CONSUMPTION#<contractId>`) for projections saved before the index existed: removing a
 * customer then finds its contracts without a scan. One paced Scan of the tenant's
 * contract partitions, spaced writes (an entry is idempotent), and a mark, so a finished
 * run is not repeated.
 */
export async function backfillCustomerIndex(
  data: TenantDataSource,
  repository: ConsumptionRepository,
  tenantId: string,
  options: IndexBackfillOptions = {},
): Promise<{ contracts: number; finishedBefore?: string }> {
  const finishedBefore = await repository.backfillFinished(tenantId);
  if (finishedBefore) return { contracts: 0, finishedBefore };
  const pace = writePacer(options.writesPerSecond ?? 2, options.wait, options.clock);
  let contracts = 0;
  for await (const page of scanTenant(await data(tenantId), tenantKey(tenantId, "CONTRACT"), {
    ...options.pace,
    ...(options.wait ? { sleep: options.wait } : {}),
  })) {
    for (const item of page) {
      if (item.SK !== "CONSUMPTION") continue;
      if (typeof item.customerId !== "string" || typeof item.contractId !== "string") continue;
      await pace();
      await repository.index(tenantId, item.customerId, item.contractId);
      contracts += 1;
    }
  }
  await repository.markBackfillFinished(tenantId, {
    finishedAt: (options.now?.() ?? new Date()).toISOString(),
    contracts,
  });
  log("info", "Customer index backfilled", { tenantId, contracts });
  return { contracts };
}
