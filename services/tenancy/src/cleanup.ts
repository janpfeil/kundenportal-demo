import { log } from "@kundenportal/service-kit";
import type { TenancyContext } from "./context.js";
import { teardownAllTenants } from "./lifecycle.js";

export const CLEANUP_RESOURCE_ID = "kundenportal-pass-tenants";

export interface CustomResourceEvent {
  RequestType: "Create" | "Update" | "Delete";
  PhysicalResourceId?: string;
}

/**
 * CloudFormation custom resource (CDK provider framework): when the base stack is
 * deleted, every pass tenant is torn down first, so no `kp-tenant-*` table, legacy
 * schema or Cognito account outlives the stack. Create and update do nothing. A thrown
 * error fails the stack operation, which is what we want if tenants could not be removed.
 */
export function createCleanup(ctx: TenancyContext) {
  return async (event: CustomResourceEvent) => {
    if (event.RequestType === "Delete") {
      const tenants = await teardownAllTenants(ctx);
      log("info", "Pass tenants removed with the stack", { tenants });
    }
    return { PhysicalResourceId: event.PhysicalResourceId ?? CLEANUP_RESOURCE_ID };
  };
}
