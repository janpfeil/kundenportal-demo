import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
const { safeReturnTo } = await import("./session");

describe("safeReturnTo", () => {
  it("keeps relative portal paths", () => {
    expect(safeReturnTo("/postfach")).toBe("/postfach");
  });

  it.each([null, "", "https://evil.example", "//evil.example", "/\\evil.example"])(
    "falls back for %j",
    (value) => {
      expect(safeReturnTo(value)).toBe("/konto");
    },
  );
});
