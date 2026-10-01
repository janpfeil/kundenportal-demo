import { describe, expect, it } from "vitest";
import { contract, product } from "@/test-fixtures";
import {
  type OperatorContract,
  availableActions,
  catalogOf,
  contractEnd,
  contractState,
  optionLabel,
  otherOptions,
  parseContractAction,
  reasonProblem,
} from "./contracts";

const termination = {
  kind: "termination" as const,
  effectiveDate: "2026-12-31",
  requestedAt: "2026-09-29T09:00:00Z",
  by: "customer" as const,
};

describe("contract state", () => {
  it("puts a block first, then the end, then a pending notice", () => {
    expect(contractState(contract())).toBe("active");
    expect(contractState(contract({ termination }))).toBe("pending-termination");
    expect(contractState(contract({ status: "terminated", termination }))).toBe("terminated");
    expect(contractState(contract({ blocked: true, termination }))).toBe("blocked");
    expect(contractEnd(contract())).toEqual({ kind: "term", date: "2026-10-31" });
    expect(contractEnd(contract({ termination }))).toEqual({
      kind: "termination",
      date: "2026-12-31",
    });
  });
});

describe("contract actions", () => {
  const strom = product();
  const green = product({ productId: "strom-gruen", name: "Strom Grün", version: 1 });
  const gas = product({ productId: "gas-komfort", division: "gas", name: "Gas Komfort" });
  const draft = product({ productId: "strom-entwurf", status: "draft" });

  it("offer what the contract allows now", () => {
    expect(availableActions(contract(), strom, [strom, green, gas, draft])).toEqual([
      "changeOption",
      "changeProduct",
      "applyPriceVersion",
      "setInstallment",
      "terminate",
      "block",
    ]);
    // Newest version, no other product of the division, a notice pending.
    expect(
      availableActions(contract({ productVersion: 2, termination }), strom, [strom, gas]),
    ).toEqual(["changeOption", "setInstallment", "cancelTermination", "block"]);
    // Blocked: only unblocking and taking a notice back.
    expect(availableActions(contract({ blocked: true, termination }), strom, [strom])).toEqual([
      "cancelTermination",
      "unblock",
    ]);
    expect(availableActions(contract({ status: "terminated" }), strom, [strom])).toEqual([]);
    // Without its product in the catalogue the contract's own option list is used.
    expect(otherOptions(contract({ tariffOptions: ["standard", "oeko"] }))).toEqual(["oeko"]);
    const {
      unit: _unit,
      productId: _product,
      ...mobile
    } = contract({
      division: "mobile",
      installmentAdjustable: false,
    });
    expect(availableActions(mobile as OperatorContract, undefined, [])).toEqual([
      "changeOption",
      "terminate",
      "block",
    ]);
  });

  it("need a reason of 3 to 300 characters", () => {
    expect(reasonProblem("  ab ")).toBe("short");
    expect(reasonProblem("Umzug")).toBeUndefined();
    expect(reasonProblem("x".repeat(301))).toBe("long");
  });

  it("let only well-formed actions through to the API", () => {
    const today = "2026-10-02";
    expect(
      parseContractAction({ type: "changeOption", optionId: "oeko", reason: " Wunsch " }),
    ).toEqual({
      type: "changeOption",
      optionId: "oeko",
      reason: "Wunsch",
    });
    expect(
      parseContractAction({
        type: "changeProduct",
        productId: "strom-gruen",
        optionId: "standard",
        reason: "Wechsel",
      }),
    ).toMatchObject({ productId: "strom-gruen" });
    expect(
      parseContractAction({
        type: "setInstallment",
        monthlyInstallmentCent: 9500,
        reason: "Mehrverbrauch",
      }),
    ).toEqual({ type: "setInstallment", monthlyInstallmentCent: 9500, reason: "Mehrverbrauch" });
    expect(
      parseContractAction({
        type: "setInstallment",
        monthlyInstallmentCent: 50,
        reason: "zu klein",
      }),
    ).toBeUndefined();
    expect(parseContractAction({ type: "terminate", reason: "Auszug" }, today)).toEqual({
      type: "terminate",
      reason: "Auszug",
    });
    expect(
      parseContractAction(
        { type: "terminate", effectiveDate: "2026-10-01", reason: "Auszug" },
        today,
      ),
    ).toBeUndefined();
    expect(
      parseContractAction(
        { type: "terminate", effectiveDate: "2026-10-31", reason: "Auszug" },
        today,
      ),
    ).toMatchObject({ effectiveDate: "2026-10-31" });
    expect(parseContractAction({ type: "block", reason: "ok" })).toBeUndefined();
    expect(parseContractAction({ type: "unblock", reason: "geklärt", extra: 1 })).toEqual({
      type: "unblock",
      reason: "geklärt",
    });
    expect(parseContractAction({ type: "delete", reason: "weg damit" })).toBeUndefined();
    expect(parseContractAction(["block"])).toBeUndefined();
  });

  it("name options by the catalogue", () => {
    const catalog = catalogOf([product()]);
    expect(catalog.get("strom-klassik")?.name).toBe("Strom Klassik");
    expect(optionLabel(catalog, "strom-klassik", "oeko")).toBe("Öko");
    expect(optionLabel(catalog, "unbekannt", "oeko")).toBe("oeko");
    expect(optionLabel(catalog, undefined, "100")).toBe("100");
  });
});
