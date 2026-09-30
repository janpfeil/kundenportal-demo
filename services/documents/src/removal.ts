import type { MigratedAccountsRemovedDetail } from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import { uploadKey } from "./model.js";
import type { DocumentRepository } from "./repository.js";
import type { UploadStorage } from "./storage.js";

/**
 * `MigratedAccountsRemoved` (demo reset): deletes every document of the removed
 * customers — the files first, with the S3 client of the event's tenant (vended
 * credentials for a pass, the Lambda's own for the owner), then the items and the
 * identity link. A failed attempt therefore still finds the items and retries the files;
 * deleting a missing object is no error, so a redelivered event is harmless.
 */
export async function removeCustomers(
  repository: DocumentRepository,
  storage: UploadStorage,
  event: MigratedAccountsRemovedDetail,
): Promise<void> {
  const { tenantId, payload } = event;
  let documents = 0;
  for (const { subject, customerId } of payload.accounts) {
    const ids = await repository.documentIds(tenantId, customerId);
    for (const id of ids) await storage.delete(tenantId, uploadKey(tenantId, customerId, id));
    await repository.removeCustomer(tenantId, subject, customerId, ids);
    documents += ids.length;
  }
  log("info", "Documents of removed customers deleted", {
    tenantId,
    customers: payload.accounts.length,
    documents,
  });
}
