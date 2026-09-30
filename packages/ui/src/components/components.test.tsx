import { render, screen, within } from "@testing-library/react";
import type { LinkProps } from "./link.js";
import { describe, expect, it } from "vitest";
import { commonTexts } from "../i18n/index.js";
import {
  AppShell,
  Badge,
  Button,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  Facts,
  Notice,
  NumberField,
  Page,
  Select,
  TextField,
} from "../index.js";

describe("AppShell", () => {
  const t = commonTexts.de;
  const shell = (signedIn: boolean) => (
    <AppShell
      brand={{ href: "/", label: t.brand }}
      navLabel={t.nav.label}
      nav={[
        { href: "/", label: t.nav.home, active: true },
        ...(signedIn ? [{ href: "/vertraege", label: t.nav.contracts }] : []),
      ]}
      languageLink={{ href: "/sprache?to=en", label: t.language.switchTo, hrefLang: "en" }}
      authLink={
        signedIn
          ? { href: "/auth/logout", label: t.auth.logout, variant: "secondary" }
          : { href: "/auth/login", label: t.auth.login }
      }
      widget={<span>Glocke</span>}
      footer={<a href={t.footer.href}>{t.footer.text}</a>}
    >
      <p>Inhalt</p>
    </AppShell>
  );

  it("renders the landmarks with their visible names", () => {
    render(shell(false));
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Inhalt");
    expect(screen.getByRole("contentinfo")).toHaveTextContent(t.footer.text);
    const nav = screen.getByRole("navigation", { name: "Hauptnavigation" });
    expect(within(nav).getByRole("link", { name: "Start" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).queryByRole("link", { name: "Verträge" })).not.toBeInTheDocument();
    expect(screen.getByText("Glocke")).toBeInTheDocument();
  });

  it("names the language link by its visible text and uses GET links only", () => {
    render(shell(false));
    const language = screen.getByRole("link", { name: "English" });
    expect(language).toHaveAttribute("href", "/sprache?to=en");
    expect(language).toHaveAttribute("hreflang", "en");
    expect(screen.getByRole("link", { name: "Anmelden" })).toHaveAttribute("href", "/auth/login");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows zone links and sign-out for signed-in visitors", () => {
    render(shell(true));
    expect(screen.getByRole("link", { name: "Verträge" })).toHaveAttribute("href", "/vertraege");
    expect(screen.getByRole("link", { name: "Abmelden" })).toHaveClass("kp-button-secondary");
  });

  it("uses a custom link component for internal links", () => {
    function TestLink(props: LinkProps) {
      return <a data-custom="yes" {...props} />;
    }
    render(
      <AppShell
        brand={{ href: "/", label: "Marke" }}
        navLabel="Nav"
        nav={[]}
        linkComponent={TestLink}
      >
        x
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Marke" })).toHaveAttribute("data-custom", "yes");
  });
});

describe("Page and Card", () => {
  it("renders one h1, the lead and card headings", () => {
    render(
      <Page title="Mein Konto" lead="Einleitung" variant="hero">
        <Card title="Adresse">Musterweg 1</Card>
      </Page>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Mein Konto" })).toBeInTheDocument();
    expect(screen.getByText("Einleitung")).toHaveClass("kp-lead");
    expect(screen.getByRole("heading", { level: 2, name: "Adresse" })).toBeInTheDocument();
  });
});

describe("Facts", () => {
  it("renders terms and descriptions and passes through attributes", () => {
    render(
      <Facts
        data-testid="account"
        items={[
          { term: "Kundennummer", description: "K-1" },
          { term: "Name", description: "Erika Muster" },
        ]}
      />,
    );
    const list = screen.getByTestId("account");
    expect(list.tagName).toBe("DL");
    expect(
      within(list)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["Kundennummer", "Name"]);
    expect(within(list).getAllByRole("definition")[1]).toHaveTextContent("Erika Muster");
  });
});

interface Reading {
  date: string;
  kwh: number;
}

describe("DataTable", () => {
  const columns = [
    { key: "date", header: "Datum", render: (row: Reading) => row.date },
    {
      key: "kwh",
      header: "Stand",
      align: "end" as const,
      render: (row: Reading) => `${row.kwh} kWh`,
    },
  ];

  it("names the table by its caption and labels cells for narrow screens", () => {
    render(
      <DataTable
        caption="Zählerstände"
        columns={columns}
        rows={[{ date: "01.01.2026", kwh: 1200 }]}
        rowKey={(row: Reading) => row.date}
      />,
    );
    const table = screen.getByRole("table", { name: "Zählerstände" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Datum", "Stand"]);
    expect(within(table).getByRole("cell", { name: "1200 kWh" })).toHaveAttribute(
      "data-label",
      "Stand",
    );
  });

  it("shows the empty state instead of an empty table", () => {
    render(
      <DataTable
        caption="Zählerstände"
        columns={columns}
        rows={[]}
        rowKey={(row: Reading) => row.date}
        empty={<EmptyState title="Noch keine Zählerstände" />}
      />,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Noch keine Zählerstände" })).toBeInTheDocument();
  });
});

describe("Buttons", () => {
  it("renders a button (type=button by default) and a button-styled link", () => {
    render(
      <>
        <Button>Speichern</Button>
        <ButtonLink href="/konto" variant="secondary">
          Zum Konto
        </ButtonLink>
      </>,
    );
    expect(screen.getByRole("button", { name: "Speichern" })).toHaveAttribute("type", "button");
    const link = screen.getByRole("link", { name: "Zum Konto" });
    expect(link).toHaveAttribute("href", "/konto");
    expect(link).toHaveClass("kp-button", "kp-button-secondary");
  });
});

describe("Form fields", () => {
  it("names text fields by their visible label and links hint and error", () => {
    render(<TextField label="E-Mail" type="email" hint="Für Rückfragen" error="Pflichtfeld" />);
    const input = screen.getByRole("textbox", { name: "E-Mail" });
    expect(input).toHaveAccessibleDescription("Für Rückfragen Pflichtfeld");
    expect(input).toBeInvalid();
  });

  it("renders number fields with their unit as description", () => {
    render(<NumberField label="Zählerstand" unit="kWh" name="reading" />);
    const input = screen.getByRole("spinbutton", { name: "Zählerstand" });
    expect(input).toHaveAccessibleDescription("kWh");
    expect(input).not.toBeInvalid();
  });

  it("renders selects with options and a placeholder", () => {
    render(
      <Select
        label="Sparte"
        placeholder="Bitte wählen"
        options={[
          { value: "strom", label: "Strom" },
          { value: "gas", label: "Gas" },
        ]}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Sparte" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Bitte wählen", "Strom", "Gas"]);
  });
});

describe("Notice and Badge", () => {
  it("uses status for info/success and alert for warning/error", () => {
    render(
      <>
        <Notice tone="success">Gespeichert</Notice>
        <Notice tone="error" title="Fehler">
          Das Konto konnte nicht geladen werden.
        </Notice>
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Gespeichert");
    expect(screen.getByRole("alert")).toHaveTextContent("Fehler");
  });

  it("renders the badge text", () => {
    render(<Badge>neu</Badge>);
    expect(screen.getByText("neu")).toHaveClass("kp-badge");
  });
});
