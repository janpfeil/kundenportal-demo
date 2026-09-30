import { describe, expect, it } from "vitest";
import { workerArn } from "./wiring.js";

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
