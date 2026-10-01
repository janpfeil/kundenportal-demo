// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import type { CustomerSummary, HistoryEntry, OperatorOverview } from "@/lib/admin";
import { catalogOf } from "@/lib/contracts";
import { contractFilters, customerFilters } from "@/lib/filters";
import { contract, product } from "@/test-fixtures";
import { ContractFacts, ContractHistory, ContractStatus } from "./contract-detail";
import { ContractTable } from "./contract-table";
import { MailboxPanel, customerColumns } from "./customers";
import { DivisionsCard, OperatorKpis } from "./operator-overview";
import { FilterBar, Pager } from "./operator-ui";
import { DataTable } from "@kundenportal/ui";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/cockpit${href}`} {...rest}>
      {children}
    </a>
  ),
}));

const overview: OperatorOverview = {
  contracts: { active: 1204, pendingTermination: 17, terminated: 88, blocked: 2 },
  byDivision: { electricity: 512, gas: 301, water: 120, internet: 199, mobile: 72 },
  days: [
    "2026-09-26",
    "2026-09-27",
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
  ],
  orders: [3, 5, 2, 0, 4, 6, 1],
  terminations: [1, 0, 2, 1, 0, 3, 2],
  endingSoon: 5,
};

describe("operator overview", () => {
  it("shows five key figures with the 7-day trends", () => {
    render(<OperatorKpis overview={overview} customers={1342} t={de} locale="de" />);
    const tiles = screen.getByTestId("operator-kpis");
    expect(within(tiles).getByRole("region", { name: "Kunden" })).toHaveTextContent("1.342");
    expect(within(tiles).getByRole("region", { name: "Aktive Verträge" })).toHaveTextContent(
      "1.204davon 2 gesperrt",
    );
    expect(within(tiles).getByRole("region", { name: "Kündigungen offen" })).toHaveTextContent(
      "175 enden in 30 Tagen",
    );
    const orders = within(tiles).getByRole("region", { name: "Neue Abschlüsse (7 Tage)" });
    expect(orders).toHaveTextContent("211 heute");
    expect(within(orders).getByRole("img")).toHaveAccessibleName(
      "Neue Abschlüsse (7 Tage), Tag für Tag: 26.09. 3, 27.09. 5, 28.09. 2, 29.09. 0, 30.09. 4, 01.10. 6, 02.10. 1",
    );
    expect(within(tiles).getByRole("region", { name: "Kündigungen (7 Tage)" })).toHaveTextContent(
      "9",
    );
  });

  it("keeps the tiles when the figures could not be loaded", () => {
    render(<OperatorKpis overview={undefined} customers={undefined} t={de} locale="de" />);
    expect(screen.getByRole("region", { name: "Kunden" })).toHaveTextContent("–");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("draws running contracts per division with links to the list", () => {
    render(<DivisionsCard overview={overview} t={de} locale="de" />);
    const bars = screen.getByTestId("division-bars");
    const items = within(bars).getAllByRole("listitem");
    expect(items.map((item) => item.dataset.division)).toEqual([
      "electricity",
      "gas",
      "water",
      "internet",
      "mobile",
    ]);
    expect(items[0]).toHaveTextContent("Strom512 Verträge");
    expect(within(items[1] as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      "/cockpit/vertraege?division=gas&status=active",
    );
  });
});

describe("lists", () => {
  it("filter with a GET form that keeps the state in the URL", () => {
    const filters = customerFilters({ q: "Kraus", origin: "legacy-telco" });
    render(
      <FilterBar
        path="/cockpit/kunden"
        filters={filters}
        t={de}
        label="Filter"
        fields={[
          { name: "q", label: "Suche", value: filters.q },
          {
            name: "origin",
            label: "Herkunft",
            value: filters.origin,
            options: [{ value: "legacy-telco", label: "Altsystem Telko" }],
          },
        ]}
      />,
    );
    const form = screen.getByRole("search", { name: "Filter" });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/cockpit/kunden");
    expect(within(form).getByLabelText("Suche")).toHaveValue("Kraus");
    expect(within(form).getByLabelText("Herkunft")).toHaveValue("legacy-telco");
    expect(within(form).getByRole("link", { name: "Zurücksetzen" })).toHaveAttribute(
      "href",
      "/cockpit/kunden",
    );
  });

  it("page with the cursor and keep the filters", () => {
    const filters = contractFilters({ status: "blocked", cursor: "p2" });
    render(
      <Pager
        path="/cockpit/vertraege"
        filters={filters}
        nextCursor="p3"
        total="42 Verträge"
        t={de}
        defaults={{ sort: "updated" }}
      />,
    );
    expect(screen.getByTestId("list-total")).toHaveTextContent("42 Verträge");
    expect(screen.getByTestId("list-next")).toHaveAttribute(
      "href",
      "/cockpit/vertraege?status=blocked&cursor=p3",
    );
    expect(screen.getByRole("link", { name: "Zur ersten Seite" })).toHaveAttribute(
      "href",
      "/cockpit/vertraege?status=blocked",
    );
  });

  it("show a customer with origin, divisions and contract counts", () => {
    const customer: CustomerSummary = {
      customerId: "K-100042",
      displayName: "Helga Kraus",
      email: "helga.kraus@example.org",
      origin: "legacy-utility",
      createdAt: "2026-09-12T08:00:00Z",
      divisions: ["electricity", "gas"],
      contracts: { active: 2, pendingTermination: 1, terminated: 0 },
    };
    render(
      <DataTable
        caption="Kunden"
        columns={customerColumns(de, "de")}
        rows={[customer]}
        rowKey={(row) => row.customerId}
      />,
    );
    const row = screen.getAllByRole("row")[1] as HTMLElement;
    expect(within(row).getByRole("link", { name: "Helga Kraus" })).toHaveAttribute(
      "href",
      "/cockpit/kunden/K-100042",
    );
    expect(row).toHaveTextContent("Altsystem Versorger");
    expect(within(row).getByRole("img", { name: "Gas" })).toBeDefined();
    expect(row).toHaveTextContent("2 aktiv · 1 gekündigt");
    expect(row).toHaveTextContent("12.09.2026");
  });

  it("list contracts with customer, product version and the date of a notice", () => {
    const pending = contract({
      termination: {
        kind: "termination",
        effectiveDate: "2026-12-31",
        requestedAt: "2026-09-29T09:00:00Z",
        by: "customer",
      },
    });
    render(
      <ContractTable
        testId="contract-table"
        rows={[pending]}
        columns={["customer", "contract", "tariff", "product", "installment", "end", "status"]}
        caption="Verträge"
        empty="leer"
        t={de}
        locale="de"
        catalog={catalogOf([product()])}
      />,
    );
    const row = within(screen.getByTestId("contract-table")).getAllByRole("row")[1] as HTMLElement;
    expect(within(row).getByRole("link", { name: "Helga Kraus" })).toBeDefined();
    expect(within(row).getByRole("link", { name: "0A1B2C3D" })).toHaveAttribute(
      "href",
      "/cockpit/vertraege/0a1b2c3d-1111-2222-3333-444455556666",
    );
    expect(row).toHaveTextContent("Strom Klassik · Standard");
    expect(row).toHaveTextContent("Preisversion 1");
    expect(row).toHaveTextContent("87,00 €");
    expect(row).toHaveTextContent("gekündigt zum 31.12.2026");
    expect(within(row).getByText("Kündigung offen")).toHaveClass("kp-status-warn");
  });
});

describe("contract page", () => {
  it("renders the history newest first with who, why and what", () => {
    const history: HistoryEntry[] = [
      {
        at: "2026-10-01T12:30:00Z",
        change: "blocked",
        by: "operator",
        reason: "Zahlungsrückstand",
      },
      {
        at: "2026-09-29T09:00:00Z",
        change: "installment",
        by: "customer",
        summary: "Abschlag 87 € → 95 €",
      },
      { at: "2025-11-01T00:00:00Z", change: "taken-over", by: "system" },
    ];
    render(<ContractHistory history={history} t={de} locale="de" />);
    const items = within(screen.getByTestId("contract-history")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Gesperrt");
    expect(items[0]).toHaveTextContent("Betreiber");
    expect(items[0]).toHaveTextContent("Begründung: Zahlungsrückstand");
    expect(items[0]).toHaveTextContent("01.10.2026, 14:30");
    expect(items[1]).toHaveTextContent("Abschlag geändertKundeAbschlag 87 € → 95 €");
    expect(items[2]).toHaveTextContent("Aus dem Altsystem übernommenSystem");
  });

  it("says so when there is no history yet", () => {
    render(<ContractHistory history={[]} t={de} locale="de" />);
    expect(screen.getByTestId("contract-history")).toHaveTextContent("Noch keine Einträge.");
  });

  it("shows state, notice and block, and the facts of the contract", () => {
    const blocked = contract({
      blocked: true,
      termination: {
        kind: "termination",
        effectiveDate: "2026-12-31",
        requestedAt: "2026-09-29T09:00:00Z",
        by: "operator",
        reason: "Umzug",
      },
    });
    render(
      <>
        <ContractStatus contract={blocked} t={de} locale="de" />
        <ContractFacts contract={blocked} t={de} locale="de" catalog={catalogOf([product()])} />
      </>,
    );
    const status = screen.getByTestId("contract-status");
    expect(within(status).getByText("gesperrt")).toHaveClass("kp-status-err");
    expect(status).toHaveTextContent("gekündigt zum 31.12.2026");
    expect(status).toHaveTextContent("Kündigung vom Betreiber am 29.09.2026, 11:00 eingegangen");
    expect(status).toHaveTextContent("Begründung: Umzug");
    expect(status).toHaveTextContent("Der Kunde kann den Vertrag nicht ändern");
    const facts = document.querySelector("dl.cockpit-facts") as HTMLElement;
    expect(facts).toHaveTextContent("87,00 € (70,00 € bis 130,00 €)");
    expect(facts).toHaveTextContent("32 ct/kWh · 12,00 € Grundpreis/Monat");
    expect(facts).toHaveTextContent("12 Monate, bis 31.10.2026");
    expect(within(facts).getByRole("link", { name: "Strom Klassik" })).toHaveAttribute(
      "href",
      "/cockpit/produkte/strom-klassik",
    );
  });

  it("shows the customer's mailbox read only", () => {
    render(
      <MailboxPanel
        name="Helga Kraus"
        t={de}
        locale="de"
        notifications={[
          {
            notificationId: "n1",
            kind: "warning",
            title: "Ihr Vertrag wurde gesperrt",
            body: "Begründung: Zahlungsrückstand",
            createdAt: "2026-10-01T12:30:00Z",
            read: false,
          },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Nachrichten an Helga Kraus, neueste zuerst" });
    expect(within(list).getByRole("listitem")).toHaveTextContent(
      "HinweisIhr Vertrag wurde gesperrt01.10.2026, 14:30ungelesenBegründung: Zahlungsrückstand",
    );
    expect(within(list).queryByRole("link")).toBeNull();
  });
});
