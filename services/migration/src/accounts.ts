import { randomBytes } from "node:crypto";
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  type CognitoIdentityProviderClient,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import type { LegacyAccountRef } from "@kundenportal/events";

export const LEGACY_REF_ATTRIBUTE = "custom:legacy_ref";
export const MIGRATION_MODE_ATTRIBUTE = "custom:migration_mode";

export type ProvisionResult =
  { ok: true; subject: string; created: boolean } | { ok: false; reason: string };

/**
 * Creates Cognito accounts for bulk-imported customers. The account gets a random
 * password nobody knows: the legacy hash cannot be transferred, so the customer sets a
 * new password with "forgot password" (the mailbox tells them). No mail is sent on
 * creation (`SUPPRESS`) — demo persons have no real addresses.
 */
export class AccountProvisioner {
  constructor(
    private readonly cognito: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
  ) {}

  async provision(
    account: LegacyAccountRef,
    email: string,
    displayName: string,
  ): Promise<ProvisionResult> {
    const ref = `${account.system}:${account.customerNumber}`;
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
    if (attribute(LEGACY_REF_ATTRIBUTE) === ref && subject) {
      return { ok: true, subject, created: false };
    }
    return { ok: false, reason: `The address ${email} belongs to another portal account` };
  }
}
