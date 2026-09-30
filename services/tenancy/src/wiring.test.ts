import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { mockClient } from "aws-sdk-client-mock";
import { describe, expect, it } from "vitest";
import { ownerHintsFromEnv, workerArn } from "./wiring.js";

describe("workerArn", () => {
  it("prefers an explicit WORKER_ARN", () => {
    expect(workerArn({ WORKER_ARN: "arn:aws:lambda:eu-central-1:1:function:w" })).toBe(
      "arn:aws:lambda:eu-central-1:1:function:w",
    );
  });

  it("builds the worker's own ARN from region, account and function name", () => {
    expect(
      workerArn({
        AWS_REGION: "eu-central-1",
        ACCOUNT_ID: "123456789012",
        AWS_LAMBDA_FUNCTION_NAME: "KundenportalApp-TenancyWorker",
      }),
    ).toBe("arn:aws:lambda:eu-central-1:123456789012:function:KundenportalApp-TenancyWorker");
  });

  it("fails without an account", () => {
    expect(() =>
      workerArn({ AWS_REGION: "eu-central-1", AWS_LAMBDA_FUNCTION_NAME: "w" }),
    ).toThrow();
  });
});

describe("ownerHintsFromEnv", () => {
  it("publishes to the owner topic with a subject of at most 100 characters", async () => {
    const sns = mockClient(SNSClient);
    sns.on(PublishCommand).resolves({});
    const topic = "arn:aws:sns:eu-central-1:123456789012:owner";
    await ownerHintsFromEnv({ OWNER_TOPIC_ARN: topic }).send("x".repeat(120), "Text");
    expect(sns.commandCalls(PublishCommand)[0]?.args[0].input).toEqual({
      TopicArn: topic,
      Subject: "x".repeat(100),
      Message: "Text",
    });
    sns.restore();
  });

  it("drops hints without a topic instead of failing", async () => {
    await expect(ownerHintsFromEnv({}).send("s", "m")).resolves.toBeUndefined();
  });
});
