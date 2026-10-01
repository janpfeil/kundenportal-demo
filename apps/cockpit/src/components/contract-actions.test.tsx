// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import { ContractActions, type ContractActionsProps } from "./contract-actions";

const sendJson = vi.fn();
const refresh = vi.fn();
vi.mock("@kundenportal/web-auth/browser", () => ({
  sendJson: (...args: unknown[]) => sendJson(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  sendJson.mockResolvedValue({ ok: true, status: 200, data: {} });
});

const ID = "0a1b2c3d-1111-2222-3333-444455556666";
const URL = `/cockpit/api/contracts/${ID}/actions`;

function renderActions(overrides: Partial<ContractActionsProps> = {}) {
  return render(
    <ContractActions
      contractId={ID}
      actions={["changeOption", "changeProduct", "setInstallment", "terminate", "block"]}
      options={[{ value: "oeko", label: "Öko" }]}
      products={[
        {
          productId: "strom-gruen",
          name: "Strom Grün",
          options: [
            { value: "basis", label: "Basis" },
            { value: "plus", label: "Plus" },
          ],
        },
      ]}
      installment="87,00 €"
      earliestTermination="2026-10-31"
      today="2026-10-02"
      texts={de.operator.actions}
      locale="de"
      {...overrides}
    />,
  );
}

const form = () => screen.getByTestId("contract-actions");
const choose = (label: string) =>
  fireEvent.change(screen.getByLabelText("Aktion"), {
    target: {
      value: Object.entries(de.operator.actions.types).find(([, text]) => text === label)?.[0],
    },
  });
const reason = (text: string) =>
  fireEvent.change(screen.getByLabelText("Begründung"), { target: { value: text } });

describe("contract actions", () => {
  it("need a reason before anything is sent", () => {
    renderActions();
    reason("ok");
    fireEvent.click(within(form()).getByRole("button", { name: "Option wechseln" }));
    expect(screen.getByLabelText("Begründung")).toHaveAccessibleDescription(
      /mindestens 3 Zeichen angeben/,
    );
    expect(screen.getByLabelText("Begründung")).toHaveAttribute("aria-invalid", "true");
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("switch the option with the reason and reload the page", async () => {
    renderActions();
    reason("Wunsch des Kunden");
    fireEvent.click(within(form()).getByRole("button", { name: "Option wechseln" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(sendJson).toHaveBeenCalledWith("POST", URL, {
      type: "changeOption",
      optionId: "oeko",
      reason: "Wunsch des Kunden",
    });
    expect(screen.getByTestId("action-feedback")).toHaveTextContent(
      "Erledigt: Option wechseln. Der Kunde wurde benachrichtigt.",
    );
  });

  it("switch the product with an option of the new product", async () => {
    renderActions();
    choose("Produkt wechseln");
    fireEvent.change(screen.getByLabelText("Option im neuen Produkt"), {
      target: { value: "plus" },
    });
    reason("Umstellung auf Grünstrom");
    fireEvent.click(within(form()).getByRole("button", { name: "Produkt wechseln" }));
    await waitFor(() => expect(sendJson).toHaveBeenCalled());
    expect(sendJson.mock.calls[0]?.[2]).toEqual({
      type: "changeProduct",
      productId: "strom-gruen",
      optionId: "plus",
      reason: "Umstellung auf Grünstrom",
    });
  });

  it("set the installment in euros and refuse amounts below 1 €", async () => {
    renderActions();
    choose("Abschlag festsetzen");
    expect(screen.getByLabelText("Neuer Abschlag")).toHaveAccessibleDescription(/bisher 87,00 €/);
    reason("Nachzahlung vermeiden");
    fireEvent.change(screen.getByLabelText("Neuer Abschlag"), { target: { value: "0,50" } });
    fireEvent.click(within(form()).getByRole("button", { name: "Abschlag festsetzen" }));
    expect(screen.getByLabelText("Neuer Abschlag")).toHaveAttribute("aria-invalid", "true");
    expect(sendJson).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Neuer Abschlag"), { target: { value: "95,50" } });
    fireEvent.click(within(form()).getByRole("button", { name: "Abschlag festsetzen" }));
    await waitFor(() => expect(sendJson).toHaveBeenCalled());
    expect(sendJson.mock.calls[0]?.[2]).toEqual({
      type: "setInstallment",
      monthlyInstallmentCent: 9550,
      reason: "Nachzahlung vermeiden",
    });
  });

  it("terminate only after a second click, to the earliest date by default", async () => {
    renderActions();
    choose("Kündigen");
    expect(screen.getByLabelText("Kündigen zum")).toHaveValue("2026-10-31");
    expect(screen.getByLabelText("Kündigen zum")).toHaveAccessibleDescription(/31\.10\.2026/);
    reason("Auszug ins Ausland");
    fireEvent.click(within(form()).getByRole("button", { name: "Kündigen" }));
    expect(sendJson).not.toHaveBeenCalled();
    const confirm = screen.getByRole("group", {
      name: "Vertrag wirklich zum 31.10.2026 kündigen?",
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Ja, ausführen" }));
    await waitFor(() => expect(sendJson).toHaveBeenCalled());
    expect(sendJson.mock.calls[0]?.[2]).toEqual({
      type: "terminate",
      effectiveDate: "2026-10-31",
      reason: "Auszug ins Ausland",
    });
  });

  it("refuse a termination in the past and let the confirmation be cancelled", () => {
    renderActions();
    choose("Kündigen");
    reason("Auszug");
    fireEvent.change(screen.getByLabelText("Kündigen zum"), { target: { value: "2026-09-30" } });
    fireEvent.click(within(form()).getByRole("button", { name: "Kündigen" }));
    expect(screen.getByLabelText("Kündigen zum")).toHaveAccessibleDescription(/ab heute/);
    choose("Sperren");
    fireEvent.click(within(form()).getByRole("button", { name: "Sperren" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("group", { name: "Vertrag wirklich sperren?" })).toBeNull();
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("say why the API refused", async () => {
    sendJson.mockResolvedValue({ ok: false, status: 409 });
    renderActions();
    reason("Wunsch des Kunden");
    fireEvent.click(within(form()).getByRole("button", { name: "Option wechseln" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/inzwischen geändert/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("fall back to an action that still exists after the page reloaded", () => {
    const { rerender } = renderActions({ actions: ["terminate", "block"] });
    expect(screen.getByLabelText("Aktion")).toHaveValue("terminate");
    rerender(
      <ContractActions
        contractId={ID}
        actions={["cancelTermination", "block"]}
        options={[]}
        products={[]}
        installment="87,00 €"
        pendingTermination="31.10.2026"
        today="2026-10-02"
        texts={de.operator.actions}
        locale="de"
      />,
    );
    expect(screen.getByLabelText("Aktion")).toHaveValue("cancelTermination");
    expect(form()).toHaveTextContent("Die Kündigung zum 31.10.2026 wird zurückgenommen");
  });

  it("say so when no action is possible", () => {
    renderActions({ actions: [] });
    expect(form()).toHaveTextContent("gerade keine Aktion möglich");
  });
});
