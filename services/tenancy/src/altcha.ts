import { randomBytes } from "node:crypto";
import {
  GetParameterCommand,
  ParameterAlreadyExists,
  ParameterNotFound,
  PutParameterCommand,
  type SSMClient,
} from "@aws-sdk/client-ssm";
import { type Challenge, createChallenge, randomInt, verifySolution } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { z } from "zod";

/**
 * HMAC key for ALTCHA from Parameter Store. CloudFormation cannot create SecureStrings,
 * so the key bootstraps itself: the first cold start that finds no parameter creates
 * one with 32 random bytes (`Overwrite: false`); if another start was faster, it reads
 * that one. Cached per execution environment; a failed load is forgotten.
 */
export function cachedHmacKey(ssm: SSMClient, name: string): () => Promise<string> {
  let pending: Promise<string> | undefined;
  const read = async () => {
    const result = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    const value = result.Parameter?.Value;
    if (!value) throw new Error(`SSM parameter ${name} is empty`);
    return value;
  };
  const load = async () => {
    try {
      return await read();
    } catch (error) {
      if (!(error instanceof ParameterNotFound)) throw error;
    }
    const key = randomBytes(32).toString("hex");
    try {
      await ssm.send(
        new PutParameterCommand({
          Name: name,
          Value: key,
          Type: "SecureString",
          Overwrite: false,
          Description: "HMAC key of the ALTCHA challenges (created by the tenancy service)",
        }),
      );
      return key;
    } catch (error) {
      if (error instanceof ParameterAlreadyExists) return read();
      throw error;
    }
  };
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}

/** Difficulty: PBKDF2 iterations per attempt and the range of the secret counter. */
export interface AltchaOptions {
  cost: number;
  maxCounter: number;
  expiresInMs: number;
}

/**
 * About one second in a browser: on average `maxCounter / 2` attempts of 1,000
 * PBKDF2-SHA-256 iterations each, spread over the widget's web workers.
 */
export const DEFAULT_ALTCHA: AltchaOptions = {
  cost: 1000,
  maxCounter: 5000,
  expiresInMs: 10 * 60 * 1000,
};

const Payload = z.object({
  challenge: z.object({
    parameters: z
      .object({
        algorithm: z.string(),
        nonce: z.string(),
        salt: z.string(),
        cost: z.number(),
        keyLength: z.number(),
        keyPrefix: z.string(),
        expiresAt: z.number().optional(),
      })
      .loose(),
    signature: z.string().min(1),
  }),
  solution: z.object({
    counter: z.number().int().nonnegative(),
    derivedKey: z.string(),
    time: z.number().optional(),
  }),
});

export type AltchaCheck =
  { ok: true; signature: string; expiresAt: Date } | { ok: false; reason: string };

/**
 * Self-hosted ALTCHA (protocol v2, PBKDF2/SHA-256): a signed proof-of-work challenge
 * the browser solves; the server checks signature, expiry and solution. Replays are
 * the caller's business (the repository remembers used signatures).
 */
export class Altcha {
  constructor(
    private readonly hmacKey: () => Promise<string>,
    private readonly options: AltchaOptions = DEFAULT_ALTCHA,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async challenge(): Promise<Challenge> {
    return createChallenge({
      algorithm: "PBKDF2/SHA-256",
      cost: this.options.cost,
      counter: randomInt(this.options.maxCounter),
      deriveKey,
      expiresAt: new Date(this.now().getTime() + this.options.expiresInMs),
      hmacSignatureSecret: await this.hmacKey(),
    });
  }

  /** Checks the widget's payload (base64 JSON of challenge and solution). */
  async verify(encoded: string): Promise<AltchaCheck> {
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    } catch {
      return { ok: false, reason: "ALTCHA payload is not base64 JSON" };
    }
    const payload = Payload.safeParse(raw);
    if (!payload.success) return { ok: false, reason: "ALTCHA payload is incomplete" };
    const { challenge, solution } = payload.data;
    if (challenge.parameters.algorithm !== "PBKDF2/SHA-256") {
      return { ok: false, reason: "ALTCHA algorithm is not accepted" };
    }
    const expiresAt = challenge.parameters.expiresAt;
    // Without an expiry a solved challenge would stay valid forever.
    if (expiresAt === undefined) return { ok: false, reason: "ALTCHA challenge has no expiry" };
    if (expiresAt * 1000 < this.now().getTime()) {
      return { ok: false, reason: "ALTCHA challenge expired" };
    }
    const result = await verifySolution({
      challenge: challenge as Challenge,
      solution: { counter: solution.counter, derivedKey: solution.derivedKey },
      deriveKey,
      hmacSignatureSecret: await this.hmacKey(),
    });
    if (!result.verified) return { ok: false, reason: "ALTCHA solution is not valid" };
    return { ok: true, signature: challenge.signature, expiresAt: new Date(expiresAt * 1000) };
  }
}
