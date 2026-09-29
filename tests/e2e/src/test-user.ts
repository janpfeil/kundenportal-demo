import { randomBytes, randomUUID } from "node:crypto";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";

const region = process.env.AWS_REGION ?? "eu-central-1";
const cognito = new CognitoIdentityProviderClient({ region });

/** Reads the user pool id from the stack outputs, so the test needs no manual configuration. */
export async function userPoolId(): Promise<string> {
  if (process.env.USER_POOL_ID) return process.env.USER_POOL_ID;
  const { Stacks } = await new CloudFormationClient({ region }).send(
    new DescribeStacksCommand({ StackName: "Kundenportal" }),
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
  await cognito.send(
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
