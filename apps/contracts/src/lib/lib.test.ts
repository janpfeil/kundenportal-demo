import { describe, expect, it } from "vitest";
import { commonTexts } from "@kundenportal/ui/i18n";
import {
  contractProblem,
  isContractId,
  parseContractUpdate,
  parseInstallmentEuros,
} from "./contract-update";
import { BASE_PATH, navigation, zonePath } from "./zone";

/** An unsigned access token with the given Cognito groups (the navigation only reads it). */
const session = (...groups: string[]) => ({
  accessToken: `e30.${Buffer.from(JSON.stringify({ "cognito:groups": groups })).toString("base64url")}.x`,
});

describe("installment input", () => {
  it("accepts whole euros within the range", () => {
    expect(parseInstallmentEuros("85", 6000, 12000)).toEqual({ ok: true, cents: 8500 });
    expect(parseInstallmentEuros(" 60,00 ", 6000, 12000)).toEqual({ ok: true, cents: 6000 });
  });

  it("explains what is wrong", () => {
    expect(parseInstallmentEuros("", 6000, 12000)).toEqual({ ok: false, reason: "empty" });
    expect(parseInstallmentEuros("85,50", 6000, 12000)).toEqual({ ok: false, reason: "whole" });
    expect(parseInstallmentEuros("abc", 6000, 12000)).toEqual({ ok: false, reason: "whole" });
    expect(parseInstallmentEuros("0", undefined, undefined)).toEqual({
      ok: false,
      reason: "whole",
    });
    expect(parseInstallmentEuros("59", 6000, 12000)).toEqual({ ok: false, reason: "range" });
    expect(parseInstallmentEuros("121", 6000, 12000)).toEqual({ ok: false, reason: "range" });
  });
});

describe("contract update body", () => {
  it("accepts installment and/or tariff option only", () => {
    expect(parseContractUpdate({ monthlyInstallmentCent: 9000 })).toEqual({
      monthlyInstallmentCent: 9000,
    });
    expect(parseContractUpdate({ tariffOption: "oeko", monthlyInstallmentCent: 100 })).toEqual({
      tariffOption: "oeko",
      monthlyInstallmentCent: 100,
    });
    for (const body of [
      null,
      [],
      {},
      { tariffOption: "" },
      { monthlyInstallmentCent: "90" },
      { x: 1 },
    ])
      expect(parseContractUpdate(body)).toBeUndefined();
  });

  it("recognises contract ids", () => {
    expect(isContractId("6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11")).toBe(true);
    expect(isContractId("../me")).toBe(false);
  });

  it("maps the API's answers to messages", () => {
    expect(contractProblem(401, undefined)).toBe("session");
    expect(contractProblem(409, "changed concurrently")).toBe("conflict");
    expect(contractProblem(422, "The installment must be between 60.00 and 120.00 EUR")).toBe(
      "range",
    );
    expect(contractProblem(422, "The installment must be whole euros")).toBe("whole");
    expect(contractProblem(422, "The monthly price of this contract is fixed")).toBe("fixed");
    expect(contractProblem(422, "Unknown tariff option x")).toBe("option");
    expect(contractProblem(500, undefined)).toBe("generic");
  });
});

describe("zone", () => {
  it("builds paths below the basePath", () => {
    expect(BASE_PATH).toBe("/vertraege");
    expect(zonePath()).toBe("/vertraege");
    expect(zonePath("/api/documents/upload-url")).toBe("/vertraege/api/documents/upload-url");
  });

  it("shows the shell's navigation with this zone active", () => {
    const nav = navigation(commonTexts.de, session());
    expect(nav.map((item) => item.href)).toEqual([
      "/",
      "/konto",
      "/postfach",
      "/vertraege",
      "/verbrauch",
    ]);
    expect(nav.filter((item) => item.active).map((item) => item.href)).toEqual(["/vertraege"]);
    expect(navigation(commonTexts.en)).toEqual([{ href: "/", label: "Home" }]);
    // The cockpit role (owner or pass holder) brings the cockpit link, pass holders also
    // their pass status.
    expect(navigation(commonTexts.de, session("owner")).map((item) => item.href)).toContain(
      "/cockpit",
    );
    expect(
      navigation(commonTexts.de, session("pass"))
        .map((item) => item.href)
        .slice(-2),
    ).toEqual(["/pass", "/cockpit"]);
  });
});
