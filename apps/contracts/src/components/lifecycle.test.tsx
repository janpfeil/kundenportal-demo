// @vitest-environment jsdom
import type { Contract } from "@kundenportal/api-contract";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import { ContractStatus } from "./contract-status";
import { TerminationCard } from "./termination-card";
import { WithdrawalCard } from "./withdrawal-card";

const sendJson = vi.fn();
const refresh = vi.fn();
vi.mock("@kundenportal/web-auth/browser", () => ({
  sendJson: (...args: unknown[]) => sendJson(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const ID = "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11";
const LOGIN = "/auth/login?returnTo=%2Fvertraege";
const contract = {
  contractId: ID,
  tariffName: "Öko-Strom",
  status: "active" as Contract["status"],
  minimumTermEndDate: "2027-03-31",
  earliestTerminationDate: "2027-03-31",
  noticePeriodMonths: 1,
  updatedAt: "2026-10-01T08:00:00.000Z",
};
const noticed = {
  ...contract,
  updatedAt: "2026-10-02T08:00:00.000Z",
  termination: {
    kind: "termination" as const,
    effectiveDate: "2027-06-30",
    requestedAt: "2026-10-02T08:00:00.000Z",
    by: "customer" as const,
  },
};

beforeEach(() => vi.clearAllMocks());

function renderTermination(overrides: Partial<Contract> = {}) {
  render(
    <TerminationCard
      contract={{ ...contract, ...overrides }}
      locale="de"
      texts={de.termination}
      loginHref={LOGIN}
    />,
  );
  return screen.getByRole("region", { name: "Kündigung" });
}

describe("TerminationCard", () => {
  it("shows the rule in one sentence and the earliest date, preset in the field", () => {
    const card = renderTermination();
    expect(card).toHaveTextContent(
      "Sie können zum Ende der Mindestlaufzeit kündigen, danach mit einer Frist von einem Monat zum Monatsende.",
    );
    expect(card).toHaveTextContent("Frühestmöglicher Termin: 31.03.2027");
    const field = within(card).getByLabelText("Kündigen zum");
    expect(field).toHaveValue("2027-03-31");
    expect(field).toHaveAttribute("min", "2027-03-31");
    expect(field).toHaveAccessibleDescription("Frühestens zum 31.03.2027");
  });

  it("names the notice period once the minimum term is over", () => {
    const card = renderTermination({
      minimumTermEndDate: "2025-12-31",
      earliestTerminationDate: "2026-11-30",
      noticePeriodMonths: 3,
    });
    expect(card).toHaveTextContent(
      "Die Mindestlaufzeit ist vorbei: Sie können mit einer Frist von 3 Monaten zum Monatsende kündigen.",
    );
    expect(card).toHaveTextContent("Frühestmöglicher Termin: 30.11.2026");
  });

  it("refuses a date before the earliest one without asking the API", () => {
    const card = renderTermination();
    const field = within(card).getByLabelText("Kündigen zum");
    fireEvent.change(field, { target: { value: "2027-02-28" } });
    fireEvent.click(within(card).getByRole("button", { name: "Kündigen …" }));
    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription(/frühestens zum 31\.03\.2027 möglich/);
    expect(within(card).queryByRole("button", { name: "Ja, kündigen" })).not.toBeInTheDocument();
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("asks for confirmation, can go back, and sends the chosen date", async () => {
    sendJson.mockResolvedValue({ ok: true, status: 200, data: noticed });
    const card = renderTermination();
    fireEvent.change(within(card).getByLabelText("Kündigen zum"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Kündigen …" }));
    const confirm = within(card).getByRole("group", { name: /wirklich zum 30\.06\.2027/ });
    expect(confirm).toHaveTextContent("Möchten Sie Öko-Strom wirklich zum 30.06.2027 kündigen?");
    fireEvent.click(within(confirm).getByRole("button", { name: "Abbrechen" }));
    expect(within(card).queryByRole("group")).not.toBeInTheDocument();
    expect(sendJson).not.toHaveBeenCalled();

    fireEvent.click(within(card).getByRole("button", { name: "Kündigen …" }));
    fireEvent.click(within(card).getByRole("button", { name: "Ja, kündigen" }));
    expect(await within(card).findByRole("status")).toHaveTextContent(
      "Ihre Kündigung ist eingegangen. Der Vertrag endet am 30.06.2027",
    );
    expect(sendJson).toHaveBeenCalledWith("POST", `/vertraege/api/contracts/${ID}/termination`, {
      effectiveDate: "2027-06-30",
    });
    expect(refresh).toHaveBeenCalled();
    expect(within(card).getByTestId("termination-status")).toHaveTextContent(
      "Gekündigt zum 30.06.2027",
    );
  });

  it("shows a pending termination and takes it back", async () => {
    sendJson.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...contract, updatedAt: "2026-10-03T08:00:00.000Z" },
    });
    const card = renderTermination(noticed);
    const status = within(card).getByTestId("termination-status");
    expect(status).toHaveTextContent("Gekündigt zum 30.06.2027");
    expect(status).toHaveTextContent("Sie können die Kündigung bis zum 30.06.2027 zurücknehmen.");
    expect(within(card).queryByTestId("termination-form")).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Kündigung zurücknehmen" }));
    expect(await within(card).findByRole("status")).toHaveTextContent(
      "Die Kündigung ist zurückgenommen.",
    );
    expect(sendJson).toHaveBeenCalledWith(
      "POST",
      `/vertraege/api/contracts/${ID}/termination/cancel`,
      {},
    );
    expect(within(card).getByTestId("termination-form")).toBeInTheDocument();
  });

  it("says who recorded an operator's termination and why", () => {
    const card = renderTermination({
      ...noticed,
      termination: { ...noticed.termination, by: "operator", reason: "Umzug ins Ausland" },
    });
    expect(card).toHaveTextContent("Erfasst von unserem Kundenservice");
    expect(card).toHaveTextContent("Begründung: Umzug ins Ausland");
  });

  it("offers nothing while the contract is blocked", () => {
    const card = renderTermination({ blocked: true });
    expect(card).toHaveTextContent("Solange der Vertrag gesperrt ist, können Sie nicht kündigen.");
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    cleanup();
    const pending = renderTermination({ ...noticed, blocked: true });
    expect(within(pending).queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains a blocked contract the API reports (409)", async () => {
    sendJson.mockResolvedValue({
      ok: false,
      status: 409,
      data: { title: "Conflict", status: 409, detail: "The contract is blocked" },
    });
    const card = renderTermination();
    fireEvent.click(within(card).getByRole("button", { name: "Kündigen …" }));
    fireEvent.click(within(card).getByRole("button", { name: "Ja, kündigen" }));
    expect(await within(card).findByRole("alert")).toHaveTextContent("Dieser Vertrag ist gesperrt");
  });

  it("states that an ended or withdrawn contract needs no notice", () => {
    expect(
      renderTermination({
        status: "terminated",
        termination: { ...noticed.termination, effectiveDate: "2026-09-30" },
      }),
    ).toHaveTextContent("Dieser Vertrag ist zum 30.09.2026 beendet.");
  });
});

describe("WithdrawalCard", () => {
  const withdrawable = { ...contract, withdrawableUntil: "2026-10-15" };

  function renderWithdrawal(overrides: Partial<Contract> = {}) {
    render(
      <WithdrawalCard
        contract={{ ...withdrawable, ...overrides }}
        locale="de"
        texts={de.withdrawal}
        loginHref={LOGIN}
      />,
    );
    return screen.getByRole("region", { name: "Widerruf" });
  }

  it("explains the period and withdraws only after confirmation", async () => {
    sendJson.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ...withdrawable,
        status: "terminated",
        updatedAt: "2026-10-02T09:00:00.000Z",
        termination: { ...noticed.termination, kind: "withdrawal", effectiveDate: "2026-10-02" },
      },
    });
    const card = renderWithdrawal();
    expect(card).toHaveTextContent("bis zum 15.10.2026 ohne Angabe von Gründen widerrufen");
    fireEvent.click(within(card).getByRole("button", { name: "Vertrag widerrufen …" }));
    expect(sendJson).not.toHaveBeenCalled();
    expect(within(card).getByRole("group")).toHaveTextContent(
      "Möchten Sie Öko-Strom wirklich widerrufen?",
    );
    fireEvent.click(within(card).getByRole("button", { name: "Ja, widerrufen" }));
    expect(await within(card).findByRole("status")).toHaveTextContent(
      "Sie haben den Vertrag widerrufen.",
    );
    expect(sendJson).toHaveBeenCalledWith("POST", `/vertraege/api/contracts/${ID}/withdrawal`, {});
    expect(within(card).queryByTestId("withdrawal-form")).not.toBeInTheDocument();
  });

  it("offers no withdrawal while the contract is blocked", () => {
    const card = renderWithdrawal({ blocked: true });
    expect(card).toHaveTextContent("Solange der Vertrag gesperrt ist");
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ContractStatus", () => {
  const texts = { status: de.status, state: de.state };

  it.each([
    [{ status: "active" }, "aktiv"],
    [{ status: "active", termination: noticed.termination }, "gekündigt zum 30.06.2027"],
    [{ status: "terminated", termination: noticed.termination }, "beendet"],
    [
      { status: "terminated", termination: { ...noticed.termination, kind: "withdrawal" } },
      "widerrufen",
    ],
    [{ status: "active", blocked: true }, "aktivgesperrt"],
  ] as const)("shows %j as %s", (value, text) => {
    const { container } = render(
      <ContractStatus contract={value as Contract} texts={texts} locale="de" />,
    );
    expect(container).toHaveTextContent(text);
  });
});
