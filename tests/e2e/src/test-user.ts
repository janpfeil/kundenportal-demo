import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";

const region = process.env.AWS_REGION ?? "eu-central-1";
const cognito = new CognitoIdentityProviderClient({ region });

/** Reads the user pool id from the stack outputs, so the test needs no manual configuration. */
export async function userPoolId(): Promise<string> {
  if (process.env.USER_POOL_ID) return process.env.USER_POOL_ID;
  const { Stacks } = await new CloudFormationClient({ region }).send(
    new DescribeStacksCommand({ StackName: "KundenportalBase" }),
  );
  const id = Stacks?.[0]?.Outputs?.find((output) => output.OutputKey === "UserPoolId")?.OutputValue;
  if (!id) throw new Error("Stack output UserPoolId not found");
  return id;
}

export interface TestUser {
  email: string;
  password: string;
  remove(): Promise<void>;
}

/**
 * Creates a confirmed user without sending mail (fresh identity per run, so the test
 * sees the real first sign-in including the welcome message). The address uses the
 * reserved `.invalid` domain and can never receive e-mail.
 */
export async function createTestUser(poolId: string): Promise<TestUser> {
  const email = `e2e-${randomUUID()}@kundenportal.invalid`;
  const password = `E2e-${randomBytes(12).toString("base64url")}!9a`;
  const created = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: email,
      MessageAction: "SUPPRESS",
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
        { Name: "name", Value: "E2E Test" },
        { Name: "locale", Value: "de" },
      ],
    }),
  );
  rememberForCleanup(created.User?.Attributes?.find((a) => a.Name === "sub")?.Value);
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: email,
      Password: password,
      Permanent: true,
    }),
  );
  return {
    email,
    password,
    remove: async () => {
      await cognito.send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: email }));
    },
  };
}

/**
 * Notes a test user's subject for the cleanup after the run (global-teardown.ts): deleting
 * the Cognito user leaves the domains' data, so the run announces its identities at the end.
 */
function rememberForCleanup(subject: string | undefined) {
  const file = process.env.E2E_IDENTITIES_FILE;
  if (subject && file) appendFileSync(file, `${subject}\n`);
}

/** Adds a user to a Cognito group, e.g. `owner` for the migration cockpit. */
export async function addToGroup(poolId: string, email: string, group: string): Promise<void> {
  await cognito.send(
    new AdminAddUserToGroupCommand({ UserPoolId: poolId, Username: email, GroupName: group }),
  );
}

/** Removes a user if it exists (e.g. a demo person left over from an earlier run). */
export async function deleteUserIfExists(poolId: string, email: string): Promise<void> {
  try {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: email }));
  } catch (error) {
    if (!(error instanceof UserNotFoundException)) throw error;
  }
}

/**
 * Sets a user's password as if they had completed "forgot password" (demo persons have
 * no real mailbox). Used for Carla after the bulk import.
 */
export async function completePasswordReset(poolId: string, email: string, password: string) {
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: email,
      Password: password,
      Permanent: true,
    }),
  );
}

/**
 * Sets a permanent password for a user the system created (e.g. a demo-pass holder, whose
 * Cognito mail with the temporary password is suppressed for test passes). Retries until
 * the user exists, because the account is created asynchronously after redemption.
 */
export async function setPassword(
  poolId: string,
  email: string,
  password: string,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: poolId,
          Username: email,
          Password: password,
          Permanent: true,
        }),
      );
      return;
    } catch (error) {
      if (!(error instanceof UserNotFoundException) || Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
}
