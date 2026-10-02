/**
 * One-off backfill of the operator's directories (phase 7, §3.7) for one tenant: contracts
 * and customers from before phase 7 enter the contract and customer directories, as their
 * next read or change would put them there. Run by scripts/backfill-directory.sh with the
 * operator's AWS credentials; each domain's part writes only that domain's items (see
 * services/contract and services/customer: directory-backfill.ts). Safe to repeat: a
 * finished run leaves a mark per domain and the next one writes nothing.
 *
 *   tsx scripts/backfill-directory.mts [tenantId]      (default: owner; env TABLE_NAME)
 */
import { backfillContractDirectory } from "../services/contract/src/directory-backfill.js";
import { ContractRepository } from "../services/contract/src/repository.js";
import { backfillCustomerDirectory } from "../services/customer/src/directory-backfill.js";
import { CustomerRepository } from "../services/customer/src/repository.js";
import { tenantData } from "../packages/service-kit/src/tenant-data.js";

const tenantId = process.argv[2] ?? "owner";
const started = Date.now();
const seconds = () => Math.round((Date.now() - started) / 1000);

const contracts = await backfillContractDirectory(
  tenantData,
  new ContractRepository(tenantData),
  tenantId,
);
console.log(
  `${seconds()} s contracts: ${contracts.contracts} found, ${contracts.added} added` +
    (contracts.finishedBefore ? ` (finished before: ${contracts.finishedBefore})` : ""),
);
const customers = await backfillCustomerDirectory(
  tenantData,
  new CustomerRepository(tenantData),
  tenantId,
  contracts.snapshots,
);
console.log(
  customers.finishedBefore
    ? `${seconds()} s customers: finished before (${customers.finishedBefore})`
    : `${seconds()} s customers: ${customers.profiles} found, ${customers.addedProfiles} added, ` +
        `${customers.addedContracts} contract summaries added`,
);
