import { randomBytes } from "node:crypto";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  type CognitoIdentityProviderClient,
  UsernameExistsException,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import type { LegacyAccountRef } from "@kundenportal/events";
import { OWNER_TENANT } from "@kundenportal/service-kit";

export const LEGACY_REF_ATTRIBUTE = "custom:legacy_ref";
export const MIGRATION_MODE_ATTRIBUTE = "custom:migration_mode";
export const TENANT_ATTRIBUTE = "custom:tenant_id";

export type ProvisionResult =
  { ok: true; subject: string; created: boolean } | { ok: false; reason: string };

/**
 * Sign-in address of a legacy customer in the portal: unchanged for the owner; a demo
 * pass's person gets the tenant as plus suffix, e.g. `anna.becker+p4k7x2qa@example.org`
 * (architektur-mandanten §2), so the same legacy address can exist once per tenant.
 */
export function portalEmail(tenantId: string, email: string): string {
  if (tenantId === OWNER_TENANT) return email;
  const at = email.lastIndexOf("@");
  return `${email.slice(0, at)}+${tenantId}${email.slice(at)}`;
}

/**
 * Creates Cognito accounts for bulk-imported customers. The account gets a random
 * password nobody knows: the legacy hash cannot be transferred, so the customer sets a
 * new password with "forgot password" (the mailbox tells them). No mail is sent on
 * creation (`SUPPRESS`) — demo persons have no real addresses. An account of a demo
 * pass carries its tenant in `custom:tenant_id`, which Cognito never lets change.
 */
export class AccountProvisioner {
  constructor(
    private readonly cognito: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
  ) {}

  async provision(
    tenantId: string,
    account: LegacyAccountRef,
    legacyEmail: string,
    displayName: string,
  ): Promise<ProvisionResult> {
    const ref = `${account.system}:${account.customerNumber}`;
    const email = portalEmail(tenantId, legacyEmail);
    try {
      const created = await this.cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          MessageAction: "SUPPRESS",
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
            { Name: "name", Value: displayName },
            { Name: "locale", Value: "de" },
            { Name: LEGACY_REF_ATTRIBUTE, Value: ref },
            { Name: MIGRATION_MODE_ATTRIBUTE, Value: "bulk" },
            ...(tenantId === OWNER_TENANT ? [] : [{ Name: TENANT_ATTRIBUTE, Value: tenantId }]),
          ],
        }),
      );
      // Confirmed with an unknown password: "forgot password" works, sign-in does not.
      await this.cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          Password: `Aa1-${randomBytes(24).toString("base64url")}`,
          Permanent: true,
        }),
      );
      const subject = created.User?.Attributes?.find((a) => a.Name === "sub")?.Value;
      if (!subject) throw new Error("Cognito returned no subject");
      return { ok: true, subject, created: true };
    } catch (error) {
      if (!(error instanceof UsernameExistsException)) throw error;
    }
    // Exists already: fine if it is this legacy account (retried task), a conflict otherwise.
    const existing = await this.cognito.send(
      new AdminGetUserCommand({ UserPoolId: this.userPoolId, Username: email }),
    );
    const attribute = (name: string) =>
      existing.UserAttributes?.find((a) => a.Name === name)?.Value;
    const subject = attribute("sub");
    const sameTenant = (attribute(TENANT_ATTRIBUTE) || OWNER_TENANT) === tenantId;
    if (attribute(LEGACY_REF_ATTRIBUTE) === ref && sameTenant && subject) {
      return { ok: true, subject, created: false };
    }
    return { ok: false, reason: `The address ${email} belongs to another portal account` };
  }

  /**
   * Removes a migrated account (demo reset). With e-mail as sign-in alias the Cognito
   * user name is the subject. Returns false if it no longer exists.
   */
  async remove(subject: string): Promise<boolean> {
    try {
      await this.cognito.send(
        new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: subject }),
      );
      return true;
    } catch (error) {
      if (error instanceof UserNotFoundException) return false;
      throw error;
    }
  }
}
