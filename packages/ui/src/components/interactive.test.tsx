import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commonTexts } from "../i18n/index.js";
import { AppShell, KeyboardShortcuts, SearchField, Switch, Tabs } from "../index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("Tabs", () => {
  const tabs = (defaultTab?: string) => (
    <Tabs
      label="Verträge"
      defaultTab={defaultTab}
      items={[
        { id: "strom", label: "Strom", icon: "bolt", panel: <p>Panel Strom</p> },
        { id: "gas", label: "Gas", icon: "flame", panel: <p>Panel Gas</p> },
        { id: "mobil", label: "Mobilfunk", panel: <p>Panel Mobilfunk</p> },
      ]}
    />
  );

  it("links tabs and panels and shows only the selected panel", () => {
    render(tabs("gas"));
    const list = screen.getByRole("tablist", { name: "Verträge" });
    const [strom, gas] = within(list).getAllByRole("tab");
    expect(gas).toHaveAttribute("aria-selected", "true");
    expect(gas).toHaveAttribute("tabindex", "0");
    expect(strom).toHaveAttribute("tabindex", "-1");
    const panel = screen.getByRole("tabpanel", { name: "Gas" });
    expect(panel).toHaveTextContent("Panel Gas");
    expect(gas).toHaveAttribute("aria-controls", panel.id);
    // The other panels are in the markup (rendered on the server), but hidden.
    expect(screen.getByText("Panel Strom").closest("[role=tabpanel]")).not.toBeVisible();
  });

  it("moves with arrow keys, Home and End and wraps around", () => {
    render(tabs());
    const [strom, gas, mobil] = screen.getAllByRole("tab");
    if (!strom || !gas || !mobil) throw new Error("tabs missing");
    fireEvent.keyDown(strom, { key: "ArrowRight" });
    expect(gas).toHaveAttribute("aria-selected", "true");
    expect(gas).toHaveFocus();
    fireEvent.keyDown(gas, { key: "End" });
    expect(mobil).toHaveFocus();
    fireEvent.keyDown(mobil, { key: "ArrowRight" });
    expect(strom).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(strom, { key: "ArrowLeft" });
    expect(mobil).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(mobil, { key: "Home" });
    expect(strom).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel Strom");
    fireEvent.click(gas);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel Gas");
  });
});

describe("Switch", () => {
  it("toggles aria-checked and reports the new state", () => {
    const changed = vi.fn();
    const { container } = render(
      <Switch defaultChecked onCheckedChange={changed} name="redemption">
        Einlösen
      </Switch>,
    );
    const toggle = screen.getByRole("switch", { name: "Einlösen" });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAttribute("type", "button");
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(changed).toHaveBeenCalledWith(false);
    expect(container.querySelector("input[name=redemption]")).toHaveValue("false");
  });

  it("follows a controlled value", () => {
    const changed = vi.fn();
    render(
      <Switch checked={false} onCheckedChange={changed}>
        Einlösen
      </Switch>,
    );
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    expect(changed).toHaveBeenCalledWith(true);
    expect(toggle).not.toBeChecked();
  });
});

describe("KeyboardShortcuts", () => {
  const setup = () => {
    const navigate = vi.fn();
    render(
      <>
        <KeyboardShortcuts
          navigate={navigate}
          shortcuts={[
            { keys: "g c", href: "/cockpit" },
            { keys: "g p", href: "/cockpit/paesse" },
          ]}
        />
        <input aria-label="Suche" />
        <div contentEditable suppressContentEditableWarning data-testid="editor">
          Text
        </div>
      </>,
    );
    return navigate;
  };

  it("navigates on g then c", () => {
    const navigate = setup();
    fireEvent.keyDown(document.body, { key: "g" });
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "c" });
    expect(navigate).toHaveBeenCalledWith("/cockpit");
    fireEvent.keyDown(document.body, { key: "x" });
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "p" });
    expect(navigate).toHaveBeenLastCalledWith("/cockpit/paesse");
  });

  it("ignores keys typed into fields and editable regions", () => {
    const navigate = setup();
    const field = screen.getByRole("textbox", { name: "Suche" });
    fireEvent.keyDown(field, { key: "g" });
    fireEvent.keyDown(field, { key: "c" });
    const editor = screen.getByTestId("editor");
    fireEvent.keyDown(editor, { key: "g" });
    fireEvent.keyDown(editor, { key: "c" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores modifier keys and too slow sequences", () => {
    vi.useFakeTimers();
    const navigate = setup();
    fireEvent.keyDown(document.body, { key: "g", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "c" });
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "g" });
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.keyDown(document.body, { key: "c" });
    expect(navigate).not.toHaveBeenCalled();
    // Shift alone (as for capitals) neither breaks nor completes a sequence.
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "Shift" });
    fireEvent.keyDown(document.body, { key: "c" });
    expect(navigate).toHaveBeenCalledWith("/cockpit");
  });
});

describe("SearchField", () => {
  it("is a GET search form named by its label", () => {
    render(
      <SearchField
        action="/cockpit/suche"
        label="Konto, Mandant oder Ereignis suchen"
        placeholder="Konto, Mandant, Ereignis …"
        defaultValue="VS-118"
      />,
    );
    const form = screen.getByRole("search", { name: "Konto, Mandant oder Ereignis suchen" });
    expect(form).toHaveAttribute("action", "/cockpit/suche");
    expect(form).toHaveAttribute("method", "get");
    const input = within(form).getByRole("searchbox", {
      name: "Konto, Mandant oder Ereignis suchen",
    });
    expect(input).toHaveAttribute("name", "q");
    expect(input).toHaveValue("VS-118");
    expect(input).toHaveAttribute("aria-keyshortcuts", "/");
  });

  it('focuses the field on "/" unless the visitor is typing elsewhere', () => {
    render(
      <>
        <SearchField action="/suche" label="Suchen" />
        <textarea aria-label="Notiz" />
      </>,
    );
    const input = screen.getByRole("searchbox", { name: "Suchen" });
    const note = screen.getByRole("textbox", { name: "Notiz" });
    note.focus();
    fireEvent.keyDown(note, { key: "/" });
    expect(note).toHaveFocus();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(input).toHaveFocus();
  });

  it("can do without the key", () => {
    const { container } = render(<SearchField action="/suche" label="Suchen" kbd={false} />);
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByRole("searchbox")).not.toHaveFocus();
    expect(container.querySelector("kbd")).toBeNull();
  });
});

describe("AppShell navigation extras", () => {
  const t = commonTexts.de;
  const cockpitNav = [
    {
      href: "/cockpit",
      label: "Übersicht",
      icon: "gauge" as const,
      group: "Migration",
      kbd: "g c",
      active: true,
    },
    {
      href: "/cockpit#klaerfaelle",
      label: "Klärfälle",
      icon: "alert" as const,
      count: 14,
      sub: true,
    },
    { href: "/cockpit#dlq", label: "DLQ", icon: "inbox" as const, count: 6, sub: true },
    {
      href: "/cockpit/paesse",
      label: "Demo-Pässe",
      icon: "ticket" as const,
      group: "Verwaltung",
      kbd: "g p",
    },
  ];

  const shell = (nav: Parameters<typeof AppShell>[0]["nav"]) => (
    <AppShell
      brand={{ href: "/", label: t.brand, suffix: "Cockpit" }}
      nav={nav}
      navLabel="Cockpit-Navigation"
      sideNavLabel="Cockpit-Navigation (Seitenleiste)"
      navTexts={t.nav}
      search={<SearchField action="/cockpit/suche" label="Suchen" />}
      version="v0.5.0 · 1a2b3c4"
    >
      x
    </AppShell>
  );

  it("shows groups, sub entries and shortcuts only in the sidebar markup", () => {
    const { container } = render(shell(cockpitNav));
    const top = screen.getByRole("navigation", { name: "Cockpit-Navigation" });
    expect(
      within(top)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/cockpit", "/cockpit/paesse"]);
    expect(top.querySelector(".kp-nav-group, kbd, .kp-nav-sub")).toBeNull();

    const side = screen.getByRole("navigation", { name: "Cockpit-Navigation (Seitenleiste)" });
    expect(side).toHaveClass("kp-sidenav");
    const migration = within(side).getByRole("list", { name: "Migration" });
    expect(within(migration).getAllByRole("link")).toHaveLength(3);
    expect(within(side).getByRole("list", { name: "Verwaltung" })).toBeInTheDocument();
    expect(
      within(side).getByRole("link", { name: "Klärfälle 14 offen" }).closest("li"),
    ).toHaveClass("kp-nav-sub");
    expect(within(side).getByRole("link", { name: "Übersicht Tastenkürzel g c" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Sub entries count for neither the top bar nor the decision for a sidebar.
    expect(container.querySelector(".kp-shell")).toHaveAttribute("data-nav-entries", "many");
  });

  it("keeps a single navigation for plain entries", () => {
    render(
      shell([
        { href: "/", label: "Start" },
        { href: "/postfach", label: "Postfach", icon: "mail", count: 2 },
      ]),
    );
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Postfach 2 offen" })).toBeInTheDocument();
  });

  it("shows brand with logo and suffix, version chip and search slot", () => {
    render(shell([{ href: "/cockpit", label: "Übersicht" }]));
    const brand = screen.getByRole("link", { name: "Kundenportal Cockpit" });
    expect(brand.querySelector("svg.kp-brand-logo")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("app-version")).toHaveTextContent("v0.5.0 · 1a2b3c4");
    expect(screen.getByRole("search", { name: "Suchen" }).parentElement).toHaveClass(
      "kp-topbar-search",
    );
  });
});
