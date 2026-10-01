import { ContractChanged, type ContractChangedDetail } from "@kundenportal/events";
import { describe, expect, it } from "vitest";
import { contractText } from "./contract-texts.js";

const contract = {
  contractId: "0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
  customerId: "c-1",
  division: "electricity",
  tariffName: "Strom Klassik",
  tariffOption: "oeko",
  monthlyInstallmentCent: 9000,
  meterNumber: "1EMH0012345678",
  unit: "kWh",
  startDate: "2026-10-15",
  status: "active",
  version: 2,
  productId: "strom-klassik",
  productVersion: 2,
};
const termination = (by: "customer" | "operator", kind = "termination") => ({
  kind,
  effectiveDate: "2026-12-31",
  requestedAt: "2026-10-02T09:00:00.000Z",
  by,
});

const detail = (payload: Record<string, unknown>): ContractChangedDetail =>
  ContractChanged.detail.parse({
    eventId: "7a2d2e75-9b5d-4d66-8b4a-6e9b5b1f3d22",
    tenantId: "owner",
    // 23:30 UTC is already 3 October in Germany: the withdrawal period counts from there.
    occurredAt: "2026-10-02T23:30:00.000Z",
    correlationId: "req-2",
    payload: {
      changeType: "updated",
      ...payload,
      contract: { ...contract, ...(payload.contract as object) },
    },
  });

const text = (locale: "de" | "en", payload: Record<string, unknown>) => {
  const result = contractText(locale, detail(payload));
  return result && { ...result, body: result.body.replace(/[\u00a0\u202f]/g, " ") };
};

const REASON = "Zählerwechsel durch den Netzbetreiber";

describe("contractText", () => {
  it.each([
    [
      "an order of the customer",
      { changeType: "created", changes: [], initiatedBy: "customer", contract: { version: 1 } },
      "info",
      [
        "Vertrag abgeschlossen",
        "Ihr Vertrag Strom Klassik, Option „oeko“ (Strom) beginnt am 15.10.2026. Monatlicher Betrag: 90,00 €. Sie können den Vertrag bis zum 17.10.2026 widerrufen.",
      ],
      [
        "Contract concluded",
        'your Strom Klassik contract, option "oeko" (electricity), starts on 15 Oct 2026. Monthly amount: €90.00. You can withdraw from it until 17 Oct 2026.',
      ],
    ],
    [
      "the customer's termination",
      {
        changes: ["termination"],
        initiatedBy: "customer",
        contract: { termination: termination("customer") },
      },
      "info",
      [
        "Kündigung bestätigt",
        "Ihre Kündigung des Vertrags Strom Klassik (Strom) ist eingegangen. Der Vertrag endet zum 31.12.2026. Bis dahin können Sie die Kündigung im Portal zurücknehmen.",
      ],
      [
        "Termination confirmed",
        "We received your notice for your Strom Klassik contract (electricity). The contract ends on 31 Dec 2026.",
      ],
    ],
    [
      "the operator's termination",
      {
        changes: ["termination"],
        initiatedBy: "operator",
        reason: REASON,
        contract: { termination: termination("operator") },
      },
      "warning",
      [
        "Vertrag gekündigt",
        `Ihr Vertrag Strom Klassik (Strom) wurde zum 31.12.2026 gekündigt. Begründung: ${REASON}`,
      ],
      [
        "Contract terminated",
        `Your Strom Klassik contract (electricity) has been terminated effective 31 Dec 2026. Reason: ${REASON}`,
      ],
    ],
    [
      "a cancelled termination",
      { changes: ["terminationCancelled"], initiatedBy: "customer" },
      "info",
      [
        "Kündigung zurückgenommen",
        "Die Kündigung Ihres Vertrags Strom Klassik (Strom) ist zurückgenommen. Der Vertrag läuft weiter.",
      ],
      [
        "Termination cancelled",
        "The termination of your Strom Klassik contract (electricity) has been cancelled.",
      ],
    ],
    [
      "a cancelled termination by the operator",
      { changes: ["terminationCancelled"], initiatedBy: "operator", reason: REASON },
      "info",
      ["Kündigung zurückgenommen", `Der Vertrag läuft weiter. Begründung: ${REASON}`],
      ["Termination cancelled", `The contract continues. Reason: ${REASON}`],
    ],
    [
      "the customer's withdrawal",
      {
        changes: ["withdrawal"],
        initiatedBy: "customer",
        contract: { status: "terminated", termination: termination("customer", "withdrawal") },
      },
      "info",
      [
        "Widerruf bestätigt",
        "Ihr Widerruf des Vertrags Strom Klassik (Strom) ist eingegangen. Der Vertrag ist damit aufgehoben.",
      ],
      [
        "Withdrawal confirmed",
        "We received the withdrawal from your Strom Klassik contract (electricity).",
      ],
    ],
    [
      "a product change by the operator",
      {
        changes: ["product", "tariffOption"],
        initiatedBy: "operator",
        reason: REASON,
        previous: {
          monthlyInstallmentCent: 9000,
          tariffOption: "standard",
          tariffName: "Strom Basis",
        },
        contract: { tariffName: "Strom Klassik" },
      },
      "info",
      [
        "Produkt gewechselt",
        `Ihr Vertrag (Strom) läuft jetzt mit dem Produkt „Strom Klassik“, Option „oeko“ (bisher „Strom Basis“). Begründung: ${REASON}`,
      ],
      [
        "Product changed",
        `Your electricity contract now runs on the product "Strom Klassik", option "oeko" (previously "Strom Basis"). Reason: ${REASON}`,
      ],
    ],
    [
      "a tariff option set by the operator",
      {
        changes: ["tariffOption"],
        initiatedBy: "operator",
        reason: REASON,
        previous: { monthlyInstallmentCent: 9000, tariffOption: "standard" },
      },
      "info",
      [
        "Tarifoption geändert",
        `Ihr Vertrag Strom Klassik (Strom) läuft jetzt mit der Option „oeko“ (bisher „standard“). Begründung: ${REASON}`,
      ],
      ["Tariff option changed", 'now runs on the option "oeko" (previously "standard"). Reason:'],
    ],
    [
      "a new price version",
      { changes: ["priceVersion"], initiatedBy: "operator", reason: REASON },
      "info",
      [
        "Neue Preise für Ihren Vertrag",
        `Ihr Vertrag Strom Klassik (Strom) wurde auf die aktuellen Preise umgestellt (Preisversion 2). Ihr monatlicher Betrag: 90,00 €. Begründung: ${REASON}`,
      ],
      [
        "New prices for your contract",
        "moved to the current prices (price version 2). Your monthly amount: €90.00.",
      ],
    ],
    [
      "an installment set by the operator",
      {
        changes: ["installment"],
        initiatedBy: "operator",
        reason: REASON,
        previous: { monthlyInstallmentCent: 8700, tariffOption: "oeko" },
      },
      "info",
      [
        "Abschlag festgesetzt",
        `Der monatliche Betrag Ihres Vertrags Strom Klassik (Strom) wurde auf 90,00 € festgesetzt (bisher 87,00 €). Begründung: ${REASON}`,
      ],
      ["Installment set", "has been set to €90.00 (previously €87.00). Reason:"],
    ],
    [
      "a block",
      {
        changes: ["blocked"],
        initiatedBy: "operator",
        reason: REASON,
        contract: { blocked: true },
      },
      "warning",
      [
        "Vertrag gesperrt",
        `Ihr Vertrag Strom Klassik (Strom) wurde gesperrt. Änderungen im Portal sind bis auf Weiteres nicht möglich. Begründung: ${REASON}`,
      ],
      ["Contract blocked", "Changes in the portal are not possible for the time being. Reason:"],
    ],
    [
      "an unblock",
      {
        changes: ["unblocked"],
        initiatedBy: "operator",
        reason: REASON,
        contract: { blocked: false },
      },
      "info",
      [
        "Vertrag entsperrt",
        `Ihr Vertrag Strom Klassik (Strom) ist wieder freigegeben. Sie können ihn im Portal wieder ändern. Begründung: ${REASON}`,
      ],
      ["Contract unblocked", "is unblocked. You can change it in the portal again. Reason:"],
    ],
    [
      "the customer's own installment change (as before phase 7)",
      {
        changes: ["installment"],
        initiatedBy: "customer",
        previous: { monthlyInstallmentCent: 8700, tariffOption: "oeko" },
      },
      "info",
      [
        "Vertrag geändert",
        "Strom Klassik (Strom) wurde geändert: monatlicher Betrag jetzt 90,00 €.",
      ],
      ["Contract changed", "was changed: monthly amount now €90.00."],
    ],
    [
      "an option change from before phase 7 (no initiator)",
      {
        changes: ["tariffOption"],
        previous: { monthlyInstallmentCent: 9000, tariffOption: "standard" },
      },
      "info",
      ["Vertrag geändert", "wurde geändert: Tarifoption jetzt „oeko“."],
      ["Contract changed", 'was changed: tariff option now "oeko".'],
    ],
    [
      "the customer's product change",
      {
        changes: ["product"],
        initiatedBy: "customer",
        previous: {
          monthlyInstallmentCent: 9000,
          tariffOption: "standard",
          tariffName: "Strom Basis",
        },
      },
      "info",
      ["Produkt gewechselt", "(bisher „Strom Basis“)."],
      ["Product changed", '(previously "Strom Basis").'],
    ],
  ])("writes %s in German and English", (_name, payload, kind, de, en) => {
    const german = text("de", payload);
    const english = text("en", payload);
    expect(german).toMatchObject({ kind, title: de[0] });
    expect(german?.body).toContain(de[1]);
    expect(english).toMatchObject({ kind, title: en[0] });
    expect(english?.body).toContain(en[1]);
  });

  it("names the entry after the most important of several changes", () => {
    const result = text("de", {
      changes: ["installment", "priceVersion", "product"],
      initiatedBy: "operator",
      reason: REASON,
      previous: {
        monthlyInstallmentCent: 8700,
        tariffOption: "standard",
        tariffName: "Strom Basis",
      },
    });
    expect(result?.title).toBe("Produkt gewechselt");
    expect(result?.body).toMatch(
      /^Ihr Vertrag \(Strom\) läuft jetzt .*Preisversion 2.* festgesetzt .* Begründung: /,
    );
    expect(result?.body.match(/Begründung/g)).toHaveLength(1);
  });

  it.each([
    ["by the system", { changeType: "created", changes: [], initiatedBy: "system" }],
    ["before phase 7", { changeType: "created", changes: [] }],
    ["by the operator", { changeType: "created", changes: [], initiatedBy: "operator" }],
  ])("writes nothing for a contract created %s", (_name, payload) => {
    expect(text("de", payload)).toBeUndefined();
    expect(text("en", payload)).toBeUndefined();
  });

  it("writes nothing for an update without changes", () => {
    expect(text("de", { changes: [], initiatedBy: "customer" })).toBeUndefined();
    expect(text("de", { changes: [], initiatedBy: "operator" })).toBeUndefined();
  });
});
