import { describe, expect, it } from "vitest";
import { deriveKey, seal, unseal } from "./crypto";

const inOneHour = () => new Date(Date.now() + 3_600_000);

describe("session crypto", () => {
  it("round-trips a payload", async () => {
    const key = deriveKey("client-secret", "session");
    const sealed = await seal({ sub: "sub-1" }, key, inOneHour());
    expect(await unseal<{ sub: string }>(sealed, key)).toMatchObject({ sub: "sub-1" });
    expect(sealed).not.toContain("sub-1");
  });

  it("separates keys by purpose and secret", async () => {
    const sealed = await seal({ sub: "sub-1" }, deriveKey("client-secret", "login"), inOneHour());
    expect(await unseal(sealed, deriveKey("client-secret", "session"))).toBeUndefined();
    expect(await unseal(sealed, deriveKey("other-secret", "login"))).toBeUndefined();
  });

  it("rejects expired and tampered values", async () => {
    const key = deriveKey("client-secret", "session");
    expect(await unseal(await seal({}, key, new Date(Date.now() - 1000)), key)).toBeUndefined();
    const sealed = await seal({ sub: "sub-1" }, key, inOneHour());
    expect(await unseal(`${sealed.slice(0, -2)}AA`, key)).toBeUndefined();
  });
});
