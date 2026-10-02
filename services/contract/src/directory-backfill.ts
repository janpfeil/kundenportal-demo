import type { ContractSnapshot } from "@kundenportal/events";
import {
  log,
  type Pace,
  scanTenant,
  tenantKey,
  type TenantDataSource,
  writePacer,
} from "@kundenportal/service-kit";
import { type Clock, systemClock } from "./clock.js";
import { ContractRecord, toSnapshot } from "./contract.js";
import { today } from "./dates.js";
import type { ContractRepository } from "./repository.js";

export interface ContractBackfillOptions {
  /** Read pace of the scan; default 100 items per page, 1 s apart. */
  pace?: Pace;
  /** Writes per second at most; default 2 (the table has 5 write units). */
  writesPerSecond?: number;
  clock?: Clock;
  /** Replaceable in tests (with `now`, which the pause moves on). */
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface ContractBackfill {
  /** Contracts of the tenant, test accounts included. */
  contracts: number;
  /** Contracts this run added to the directory (2 writes each). */
  added: number;
  /** A snapshot of every contract, for the customer directory's contract summaries. */
  snapshots: ContractSnapshot[];
  /** When an earlier run finished, if one did; this run then wrote nothing. */
  finishedBefore?: string;
}

/**
 * One-off backfill of the contract directory (phase 7, §3.7): every contract saved before
 * phase 7 gets its directory entry and mark, as its first read would give it
 * (`ContractRepository.backfill`, with the customer's name from the identity link). Reads
 * the tenant once with a paced Scan; writes are spaced. Contracts already listed cost no
 * write, so the run is idempotent; a finished run leaves a mark and is not repeated. The
 * snapshots go to the customer domain's part of the backfill.
 */
export async function backfillContractDirectory(
  data: TenantDataSource,
  repository: ContractRepository,
  tenantId: string,
  options: ContractBackfillOptions = {},
): Promise<ContractBackfill> {
  const clock = options.clock ?? systemClock;
  const finishedBefore = await repository.backfillFinished(tenantId);
  const pace = writePacer(options.writesPerSecond ?? 2, options.wait, options.now);
  const day = today(clock.now());
  const records: ContractRecord[] = [];
  const names = new Map<string, string>();
  let skipped = 0;

  for await (const page of scanTenant(await data(tenantId), `${tenantKey(tenantId)}#`, {
    ...options.pace,
    ...(options.wait ? { sleep: options.wait } : {}),
  })) {
    for (const item of page) {
      const pk = String(item.PK);
      const sk = String(item.SK);
      if (sk === "CONTRACTS" && pk.startsWith(tenantKey(tenantId, "SUBJ"))) {
        if (typeof item.customerId === "string" && typeof item.customerName === "string") {
          names.set(item.customerId, item.customerName);
        }
      } else if (sk.startsWith("CONTRACT#") && pk.startsWith(tenantKey(tenantId, "CUST"))) {
        const parsed = ContractRecord.safeParse(item);
        if (parsed.success) records.push(parsed.data);
        else skipped += 1;
      }
    }
  }
  if (skipped) log("warn", "Unreadable contracts skipped", { tenantId, skipped });

  let added = 0;
  const snapshots: ContractSnapshot[] = [];
  for (const record of records) {
    let current = record;
    if (!record.listed && !finishedBefore) {
      await pace();
      await pace();
      current = await repository.backfill(tenantId, record, names.get(record.customerId));
      added += 1;
    }
    snapshots.push(toSnapshot(current, day));
  }
  if (!finishedBefore) {
    await repository.markBackfillFinished(tenantId, {
      finishedAt: clock.now().toISOString(),
      contracts: records.length,
      added,
    });
  }
  log("info", "Contract directory backfilled", { tenantId, contracts: records.length, added });
  return {
    contracts: records.length,
    added,
    snapshots,
    ...(finishedBefore ? { finishedBefore } : {}),
  };
}
