// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import { AccountCard } from "./account-card";
import { ContractCard } from "./contract-card";
import { LinkOffers } from "./link-offers";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const texts = de.overview.contracts;
const plain = (text: string | null | undefined) => (text ?? "").replace(/[\u00a0\u202f]/g, " ");

describe("ContractCard", () => {
  it("shows tariff, sub line, installment, a labelled trend, status and details", () => {
    render(
      <ContractCard
        locale="de"
        texts={texts}
        card={{
          contractId: "c1",
          division: "electricity",
          title: "Strom Klassik",
          sub: "Standard · Zähler …4471",
          priceCent: 8700,
          priceKind: "installment",
          trend: { kind: "sparkline", values: [281, 296, 186], min: 186, max: 296, unit: "kWh" },
          status: "active",
        }}
      />,
    );
    const card = screen.getByRole("article", { name: "Strom Klassik" });
    expect(plain(card.textContent)).toContain("87 € Abschlag / Monat");
    expect(card).toHaveTextContent("Standard · Zähler …4471");
    expect(
      within(card).getByRole("img", {
        name: /Verbrauch der letzten 12 Monate: 186 kWh bis 296 kWh/,
      }),
    ).toBeInTheDocument();
    expect(card).toHaveTextContent("aktiv");
    expect(within(card).getByRole("link", { name: "Details zu Strom Klassik" })).toHaveAttribute(
      "href",
      "/vertraege/c1",
    );
  });

  it("marks the mobile data usage as a demo value", () => {
    render(
      <ContractCard
        locale="de"
        texts={texts}
        card={{
          contractId: "c2",
          division: "mobile",
          title: "Mobil 20 GB",
          sub: "+49 151 2345 6789",
          priceCent: 1999,
          priceKind: "monthly",
          trend: { kind: "usage", usedMb: 12698, includedMb: 20480 },
          status: "terminated",
        }}
      />,
    );
    const card = screen.getByRole("article", { name: "Mobil 20 GB" });
    expect(plain(card.textContent)).toContain("19,99 € Monatspreis");
    expect(within(card).getByRole("meter", { name: "Datenvolumen" })).toHaveAttribute(
      "aria-valuetext",
      "12,4 von 20 GB verbraucht",
    );
    expect(card.querySelector('[data-fake="true"]')).not.toBeNull();
    expect(card).toHaveTextContent("gekündigt");
  });
});

describe("AccountCard", () => {
  it("opens the profile form from the card's heading row", () => {
    render(
      <AccountCard
        title="Mein Konto"
        profile={{ displayName: "Anna Becker", locale: "de" }}
        texts={de.account.edit}
      >
        <p>Fakten</p>
      </AccountCard>,
    );
    expect(screen.getByRole("region", { name: "Mein Konto" })).toHaveTextContent("Fakten");
    const toggle = screen.getByRole("button", { name: "Profil ändern" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("profile-form")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Schließen" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Anzeigename" })).toHaveValue("Anna Becker");
  });
});

describe("LinkOffers", () => {
  it("offers the legacy account with its password field and tags the system", () => {
    render(
      <LinkOffers
        texts={de.account.links}
        offers={[
          {
            candidate: { system: "telco", customerNumber: "T/88-4711" },
            displayName: "B. Brandt",
            address: "Lindenweg 12, 04109 Leipzig",
            status: "offered",
          },
        ]}
      />,
    );
    const card = screen.getByRole("region", { name: "Weitere Kundenkonten" });
    expect(card).toHaveTextContent("Telko");
    const offer = screen.getByTestId("link-offer");
    expect(offer).toHaveTextContent("T/88-4711");
    expect(within(offer).getByLabelText("Passwort des anderen Kontos")).toHaveAttribute(
      "type",
      "password",
    );
    expect(within(offer).getByRole("button", { name: "Verknüpfen" })).toBeEnabled();
  });
});
