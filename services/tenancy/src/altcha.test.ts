import {
  GetParameterCommand,
  ParameterAlreadyExists,
  ParameterNotFound,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { Altcha, cachedHmacKey, DEFAULT_ALTCHA } from "./altcha.js";

const ssmMock = mockClient(SSMClient);
const NAME = "/kundenportal/tenancy/altcha-hmac-key";
const notFound = () => new ParameterNotFound({ message: "missing", $metadata: {} });

beforeEach(() => ssmMock.reset());

describe("HMAC key", () => {
  it("reads the SecureString once per environment", async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: "stored-key" } });
    const key = cachedHmacKey(new SSMClient({}), NAME);
    expect(await key()).toBe("stored-key");
    expect(await key()).toBe("stored-key");
    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(1);
    expect(ssmMock.commandCalls(GetParameterCommand)[0]?.args[0].input).toEqual({
      Name: NAME,
      WithDecryption: true,
    });
  });

  it("creates a random key when the parameter is missing, without overwriting", async () => {
    ssmMock.on(GetParameterCommand).rejects(notFound());
    ssmMock.on(PutParameterCommand).resolves({});
    const key = await cachedHmacKey(new SSMClient({}), NAME)();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(ssmMock.commandCalls(PutParameterCommand)[0]?.args[0].input).toMatchObject({
      Name: NAME,
      Value: key,
      Type: "SecureString",
      Overwrite: false,
    });
  });

  it("reads the key of a concurrent cold start that created it first", async () => {
    ssmMock
      .on(GetParameterCommand)
      .rejectsOnce(notFound())
      .resolves({ Parameter: { Value: "winner" } });
    ssmMock
      .on(PutParameterCommand)
      .rejects(new ParameterAlreadyExists({ message: "exists", $metadata: {} }));
    expect(await cachedHmacKey(new SSMClient({}), NAME)()).toBe("winner");
  });

  it("forgets a failed load", async () => {
    ssmMock
      .on(GetParameterCommand)
      .rejectsOnce(new Error("throttled"))
      .resolves({ Parameter: { Value: "later" } });
    const key = cachedHmacKey(new SSMClient({}), NAME);
    await expect(key()).rejects.toThrow("throttled");
    expect(await key()).toBe("later");
  });
});

describe("ALTCHA", () => {
  const easy = { cost: 10, maxCounter: 20, expiresInMs: 600_000 };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

  it("accepts a solved challenge and returns its signature and expiry", async () => {
    const altcha = new Altcha(async () => "key", easy);
    const challenge = await altcha.challenge();
    const solution = await solveChallenge({ challenge, deriveKey });
    const check = await altcha.verify(encode({ challenge, solution }));
    expect(check).toMatchObject({ ok: true, signature: challenge.signature });
  });

  it("rejects wrong solutions, tampered and expired challenges", async () => {
    const altcha = new Altcha(async () => "key", easy);
    const challenge = await altcha.challenge();
    const solution = await solveChallenge({ challenge, deriveKey });
    if (!solution) throw new Error("unsolved");

    const wrong = await altcha.verify(
      encode({ challenge, solution: { ...solution, counter: solution.counter + 1 } }),
    );
    expect(wrong).toMatchObject({ ok: false });

    const tampered = {
      ...challenge,
      parameters: { ...challenge.parameters, cost: 1 },
    };
    expect(await altcha.verify(encode({ challenge: tampered, solution }))).toMatchObject({
      ok: false,
    });

    const later = new Altcha(
      async () => "key",
      easy,
      () => new Date(Date.now() + 700_000),
    );
    expect(await later.verify(encode({ challenge, solution }))).toEqual({
      ok: false,
      reason: "ALTCHA challenge expired",
    });
    expect(await altcha.verify("%%%")).toMatchObject({ ok: false });
  });

  it("targets about a second in a browser by default", () => {
    expect(DEFAULT_ALTCHA.cost * DEFAULT_ALTCHA.maxCounter).toBe(5_000_000);
    expect(DEFAULT_ALTCHA.expiresInMs).toBe(600_000);
  });
});
