import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { AppShell, type NavItem } from "../components/app-shell.js";
import { Grid, Split } from "../components/grid.js";
import { KeyboardShortcuts } from "../components/keyboard-shortcuts.js";
import { Kpi, KpiGrid } from "../components/kpi.js";
import { Card, Page } from "../components/page.js";
import { SearchField } from "../components/search-field.js";
import { Kbd, LiveIndicator, StatusBadge } from "../components/status.js";
import { Switch } from "../components/switch.js";
import { Tabs } from "../components/tabs.js";
import { storyTexts } from "./texts.js";

/**
 * Navigation and controls of the phase 6 pages: the cockpit shell with sidebar sections,
 * counters and shortcut hints (as in the mockup's "Dicht" preset), the customer shell with
 * icons, search field, keyboard shortcuts, tabs, switch and the layout helpers.
 */
const meta: Meta = {
  title: "Navigation",
};

export default meta;
type Story = StoryObj;

/** Hash targets keep every link inside the story. */
const COCKPIT_NAV: NavItem[] = [
  {
    href: "#cockpit",
    label: "Übersicht",
    icon: "gauge",
    group: "Migration",
    kbd: "g c",
    active: true,
  },
  { href: "#klaerfaelle", label: "Klärfälle", icon: "alert", count: 14, sub: true },
  { href: "#dlq", label: "DLQ", icon: "inbox", count: 6, sub: true },
  { href: "#ereignisse", label: "Ereignisse", icon: "clock", sub: true },
  { href: "#paesse", label: "Demo-Pässe", icon: "ticket", group: "Verwaltung", kbd: "g p" },
  { href: "#einstellungen", label: "Einstellungen", icon: "settings", sub: true },
];

function CockpitShell({ globals }: { globals: Record<string, unknown> }) {
  const { common: t } = storyTexts(globals);
  return (
    <AppShell
      brand={{ href: "#start", label: t.brand, suffix: "Cockpit" }}
      nav={COCKPIT_NAV}
      navLabel="Cockpit-Navigation"
      sideNavLabel="Cockpit-Navigation (Seitenleiste)"
      navTexts={t.nav}
      version="v0.5.0 · 1a2b3c4"
      search={
        <SearchField
          action="#suche"
          label="Konto, Mandant oder Ereignis suchen"
          placeholder="Konto, Mandant, Ereignis …"
        />
      }
      user={{
        name: "Lena Vogt",
        email: "lena.vogt@example.org",
        label: t.auth.menu,
        logout: { href: "#logout", label: t.auth.logout },
      }}
      appearance={{ audience: "cockpit", texts: t.appearance }}
      footer="Migrations-Cockpit · Alle Daten sind erfunden."
    >
      <KeyboardShortcuts
        shortcuts={[
          { keys: "g c", href: "#cockpit" },
          { keys: "g p", href: "#paesse" },
        ]}
        navigate={(href) => {
          window.location.hash = href;
        }}
      />
      <Page
        eyebrow="Migration"
        title="Migrations-Cockpit"
        aside={<LiveIndicator>Aktualisiert sich alle 10 Sekunden · 10:42:18</LiveIndicator>}
      >
        <KpiGrid>
          <Kpi
            label="Offene Klärfälle"
            value="14"
            delta={{ text: "+3 seit gestern", tone: "bad" }}
          />
          <Kpi
            label="Dead-Letter-Queue"
            value="6"
            delta={{ text: "−2 nach Redrive", tone: "good" }}
          />
          <Kpi label="Versorger" value="1.842" of="/ 2.400" />
          <Kpi label="Telko" value="611" of="/ 1.150" />
        </KpiGrid>
        <p>
          Tastenkürzel: <Kbd>g c</Kbd> Übersicht, <Kbd>g p</Kbd> Demo-Pässe, <Kbd>/</Kbd> Suche.
        </p>
      </Page>
    </AppShell>
  );
}

/** "Dicht" (default): sidebar with sections, indented sub entries, counters and shortcuts. */
export const CockpitSidebar: Story = {
  name: "Cockpit shell (Dicht)",
  parameters: { layout: "fullscreen" },
  globals: { preset: "dicht" },
  render: (_, { globals }) => <CockpitShell globals={globals} />,
};

/** "Übersicht" puts the navigation into the top bar: only the plain entries appear there. */
export const CockpitTopBar: Story = {
  name: "Cockpit shell (Übersicht)",
  parameters: { layout: "fullscreen" },
  globals: { preset: "uebersicht" },
  render: (_, { globals }) => <CockpitShell globals={globals} />,
};

export const CockpitPhone: Story = {
  name: "Cockpit shell (360 px)",
  parameters: { layout: "fullscreen" },
  globals: { preset: "dicht", viewport: { value: "phone360" } },
  render: (_, { globals }) => <CockpitShell globals={globals} />,
};

function CustomerShell({ globals }: { globals: Record<string, unknown> }) {
  const { common: t } = storyTexts(globals);
  return (
    <AppShell
      brand={{ href: "#start", label: t.brand }}
      nav={[
        { href: "/", label: t.nav.home, icon: "home" },
        { href: "#postfach", label: t.nav.mailbox, icon: "mail", count: 2 },
        { href: "#vertraege", label: t.nav.contracts, icon: "file" },
        { href: "#verbrauch", label: t.nav.consumption, icon: "chart", active: true },
        { href: "#pass", label: t.nav.pass, icon: "ticket" },
        { href: "#cockpit", label: t.nav.cockpit, icon: "gauge" },
      ]}
      navLabel={t.nav.label}
      navTexts={t.nav}
      languageLink={{ href: "#en", label: "English", hrefLang: "en" }}
      version="v0.5.0 · 1a2b3c4"
      user={{
        name: "Anna Becker",
        email: "anna.becker@example.org",
        label: t.auth.menu,
        logout: { href: "#logout", label: t.auth.logout },
      }}
      appearance={{ audience: "kunde", texts: t.appearance }}
      footer={<a href={t.footer.href}>{t.footer.text}</a>}
    >
      <Page eyebrow="Mittwoch, 1. Oktober 2026" title="Guten Tag, Anna Becker">
        <Card title="Mein Konto">Kundennummer KP-104 233</Card>
      </Page>
    </AppShell>
  );
}

/** Customer shell with icons and the mailbox counter; "Warm" moves it to a bottom bar on phones. */
export const CustomerIcons: Story = {
  name: "Customer shell (icons, counter)",
  parameters: { layout: "fullscreen" },
  render: (_, { globals }) => <CustomerShell globals={globals} />,
};

export const CustomerWarmPhone: Story = {
  name: "Customer shell (Warm, 360 px)",
  parameters: { layout: "fullscreen" },
  globals: { preset: "warm", viewport: { value: "phone360" } },
  render: (_, { globals }) => <CustomerShell globals={globals} />,
};

export const SearchFieldStory: Story = {
  name: "SearchField",
  render: () => (
    <SearchField
      action="#suche"
      label="Konto, Mandant oder Ereignis suchen"
      placeholder="Konto, Mandant, Ereignis …"
    />
  ),
};

export const TabsStory: Story = {
  name: "Tabs",
  render: () => (
    <Tabs
      label="Verträge"
      items={[
        {
          id: "strom",
          label: "Strom",
          icon: "bolt",
          panel: <Card title="Strom Klassik">Zähler 1ESY 1160 4471 23</Card>,
        },
        {
          id: "gas",
          label: "Gas",
          icon: "flame",
          panel: <Card title="Gas Komfort">Zähler 7GMT 0021 0918</Card>,
        },
        {
          id: "mobil",
          label: "Mobilfunk",
          icon: "phone",
          panel: <Card title="Mobil 20 GB">+49 151 2345 6789</Card>,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Strom" }));
    await userEvent.keyboard("{ArrowRight}");
  },
};

function RedemptionSwitch() {
  const [open, setOpen] = useState(true);
  return (
    <Switch
      checked={open}
      onCheckedChange={setOpen}
      status={<StatusBadge tone={open ? "ok" : "err"}>{open ? "offen" : "gesperrt"}</StatusBadge>}
    >
      Einlösen
    </Switch>
  );
}

export const SwitchStory: Story = {
  name: "Switch",
  render: () => (
    <Card title="Einstellungen">
      <RedemptionSwitch />
      <p className="kp-muted">
        Gesperrt lässt sich keine Einladung einlösen; laufende Pässe bleiben nutzbar.
      </p>
      <Switch defaultChecked={false}>Budget-Alarm sperrt automatisch</Switch>
    </Card>
  ),
};

export const LayoutHelpers: Story = {
  name: "Grid and Split",
  render: () => (
    <>
      <Grid min="230px">
        <Card title="Strom Klassik" headingLevel={3}>
          87 € Abschlag / Monat
        </Card>
        <Card title="Gas Komfort" headingLevel={3}>
          68 € Abschlag / Monat
        </Card>
        <Card title="Mobil 20 GB" headingLevel={3}>
          19,99 € Monatspreis
        </Card>
      </Grid>
      <div style={{ height: 16 }} />
      <Split>
        <Card title="Mein Konto">Hauptspalte (1,6 : 1)</Card>
        <Card title="Postfach">Seitenspalte; ab 860 px untereinander</Card>
      </Split>
    </>
  ),
};
