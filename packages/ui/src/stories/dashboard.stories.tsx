import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, ButtonLink } from "../components/button.js";
import { MiniBars, ProgressRing, Sparkline } from "../components/charts.js";
import { DataTable } from "../components/data.js";
import { Banner } from "../components/feedback.js";
import { CockpitGrid, Stack } from "../components/grid.js";
import { ICON_NAMES, Icon, IconCircle } from "../components/icon.js";
import { Kpi, KpiGrid } from "../components/kpi.js";
import { MessageList } from "../components/message-list.js";
import { Meter } from "../components/meter.js";
import { Card, Page } from "../components/page.js";
import { FakeMarker, Kbd, LiveIndicator, StatusBadge } from "../components/status.js";
import { Timeline, type TimelineItem } from "../components/timeline.js";
import { formatNumber } from "../format.js";
import { storyTexts } from "./texts.js";

/**
 * Building blocks of the phase 6 pages with the demo data of the design mockup
 * (docs/design/mockups.html): icons, status badges, the demo-value marker, key figures,
 * banner, timeline and message list, and the cockpit's key figures composed.
 */
const meta: Meta = {
  title: "Dashboard",
};

export default meta;
type Story = StoryObj;

export const Icons: Story = {
  render: () => (
    <ul
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
        gap: 12,
        margin: 0,
        padding: 0,
        listStyle: "none",
      }}
    >
      {ICON_NAMES.map((name) => (
        <li key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name={name} />
          <code>{name}</code>
        </li>
      ))}
      <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <IconCircle name="bolt" />
        <code>IconCircle</code>
      </li>
    </ul>
  ),
};

export const StatusBadges: Story = {
  name: "StatusBadge, FakeMarker, LiveIndicator, Kbd",
  render: (_, { globals }) => {
    const { locale } = storyTexts(globals);
    return (
      <Stack>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <StatusBadge tone="ok">aktiv</StatusBadge>
          <StatusBadge tone="ok" pulse>
            Aktiv
          </StatusBadge>
          <StatusBadge tone="info" pulse>
            läuft
          </StatusBadge>
          <StatusBadge tone="warn">keine gültige E-Mail</StatusBadge>
          <StatusBadge tone="err">Kontingent erschöpft</StatusBadge>
          <StatusBadge>gekündigt</StatusBadge>
        </div>
        <p>
          Datenvolumen 12,4 von 20 GB verbraucht <FakeMarker locale={locale} />
        </p>
        <LiveIndicator>Aktualisiert sich alle 10 Sekunden · 10:42:18</LiveIndicator>
        <p>
          Suche mit <Kbd>/</Kbd>, Übersicht mit <Kbd>g c</Kbd>
        </p>
      </Stack>
    );
  },
};

export const KpiVariants: Story = {
  name: "Kpi",
  render: (_, { globals }) => {
    const { locale } = storyTexts(globals);
    const n = (value: number) => formatNumber(value, locale);
    return (
      <KpiGrid>
        <Kpi
          aria-label="Fortschritt Versorger"
          label="Versorger"
          value={n(1842)}
          of={`/ ${n(2400)}`}
          delta={{ text: "+126 heute", tone: "good" }}
          ring={
            <ProgressRing
              value={1842}
              max={2400}
              label={`Versorger: ${n(1842)} von ${n(2400)} übernommen (77 %)`}
              center="77 %"
            />
          }
        />
        <Kpi
          aria-label="Offene Klärfälle"
          label="Offene Klärfälle"
          value="14"
          delta={{ text: "+3 seit gestern", tone: "bad" }}
          aside={<Sparkline values={[6, 8, 7, 9, 11, 11, 14]} />}
        />
        <Kpi label="Aktive Pass-Mandanten" value="3" of="/ 4">
          <Meter label="Aktive Pass-Mandanten" value={3} max={4} thin hideLabel />
        </Kpi>
        <Kpi label="Nie angemeldet" value="1" hint="Erinnerung nach 24 Std." />
      </KpiGrid>
    );
  },
};

export const BannerStory: Story = {
  name: "Banner",
  render: () => (
    <Banner
      icon="bolt"
      title="Zählerstand Strom fällig"
      action={<ButtonLink href="#verbrauch">Jetzt erfassen</ButtonLink>}
    >
      Bitte melden Sie den Stand bis 15.10.2026 — so stimmt Ihr nächster Abschlag.
    </Banner>
  ),
};

const EVENTS: TimelineItem[] = [
  {
    id: "1",
    icon: "check",
    tone: "ok",
    title: "Konto übernommen",
    code: "AccountMigrated",
    meta: ["VS-118 377"],
    time: <time dateTime="2026-10-01T10:41:00+02:00">10:41</time>,
  },
  {
    id: "2",
    icon: "alert",
    tone: "warn",
    title: "Klärfall angelegt",
    code: "ClarificationRaised",
    meta: ["VS-118 204"],
    time: <time dateTime="2026-10-01T10:38:00+02:00">10:38</time>,
  },
  {
    id: "3",
    icon: "link",
    title: "Konten verknüpft",
    code: "AccountsLinked",
    meta: ["KP-104 233 ↔ TK-88 41 207"],
    time: <time dateTime="2026-10-01T10:33:00+02:00">10:33</time>,
  },
  {
    id: "4",
    icon: "upload",
    title: "Bulk-Import Telko gestartet",
    code: "BulkImportStarted",
    meta: ["Lena Vogt"],
    time: <time dateTime="2026-10-01T10:31:00+02:00">10:31</time>,
  },
  {
    id: "5",
    icon: "x",
    tone: "err",
    title: "Datensatz in DLQ",
    code: "RecordFailed",
    meta: ["TK-88 41 902"],
    time: <time dateTime="2026-10-01T10:29:00+02:00">10:29</time>,
  },
  {
    id: "6",
    icon: "bolt",
    tone: "ok",
    title: "Zählerstand erfasst",
    code: "MeterReadingRecorded",
    meta: ["KP-104 233"],
    time: <time dateTime="2026-10-01T09:14:00+02:00">09:14</time>,
  },
];

export const TimelineStory: Story = {
  name: "Timeline",
  render: () => (
    <Card as="section" title="Ereignis-Timeline" actions={<span className="kp-muted">7 Tage</span>}>
      <Timeline items={EVENTS} />
    </Card>
  ),
};

export const MessageListStory: Story = {
  name: "MessageList",
  render: (_, { globals }) => {
    const { locale } = storyTexts(globals);
    return (
      <Card as="section" title="Postfach" actions={<StatusBadge tone="info">2 neu</StatusBadge>}>
        <MessageList
          locale={locale}
          items={[
            {
              id: "a",
              href: "#n=a",
              title: "Zählerstand gespeichert",
              time: "09:14",
              preview: "Ihr Zählerstand 48.213 kWh ist eingegangen.",
              unread: true,
              current: true,
            },
            {
              id: "b",
              href: "#n=b",
              title: "Neuer Abschlag ab November",
              time: "gestern",
              preview: "Ihr Abschlag für Strom Klassik beträgt ab 1. November 87 €.",
              unread: true,
            },
            {
              id: "c",
              href: "#n=c",
              title: "Willkommen im Kundenportal",
              time: "28.09.",
              preview: "Schön, dass Sie da sind. Hier finden Sie alle Verträge.",
            },
          ]}
        />
      </Card>
    );
  },
};

interface Clarification {
  account: string;
  name: string;
  system: string;
  problem: string;
  at: string;
}

const CLARIFICATIONS: Clarification[] = [
  {
    account: "VS-118 204",
    name: "Karl Stein",
    system: "Versorger",
    problem: "keine gültige E-Mail",
    at: "10:38",
  },
  {
    account: "TK-88 02 911",
    name: "Paula Brandt",
    system: "Telko",
    problem: "Dublette: 2 Konten",
    at: "10:36",
  },
  {
    account: "TK-88 17 450",
    name: "Emre Yıldız",
    system: "Telko",
    problem: "Anschrift weicht ab",
    at: "10:21",
  },
];

/**
 * The cockpit overview of the mockup: heading with live indicator, four key figures,
 * clarification cases, timeline and the danger card. Default preset "Dicht".
 */
export const CockpitKennzahlen: Story = {
  name: "Cockpit-Kennzahlen (composed)",
  parameters: { layout: "fullscreen" },
  globals: { preset: "dicht" },
  render: (_, { globals }) => {
    const { locale } = storyTexts(globals);
    const n = (value: number) => formatNumber(value, locale);
    return (
      <main className="kp-main">
        <Page
          eyebrow="Migration"
          title="Migrations-Cockpit"
          aside={
            <>
              <LiveIndicator>Aktualisiert sich alle 10 Sekunden · 10:42:18</LiveIndicator>
              <ButtonLink href="#aktualisieren" variant="secondary">
                <Icon name="refresh" />
                Aktualisieren
              </ButtonLink>
            </>
          }
          lead="Übernahme der Kundenkonten aus den Altsystemen von Versorger und Telko: Fortschritt, Klärfälle, fehlerhafte Datensätze und alle Ereignisse."
        >
          <Stack>
            <KpiGrid>
              <Kpi
                aria-label="Fortschritt Versorger"
                label="Versorger"
                value={n(1842)}
                of={`/ ${n(2400)}`}
                delta={{ text: "+126 heute", tone: "good" }}
                ring={
                  <ProgressRing
                    value={1842}
                    max={2400}
                    label={`Versorger: ${n(1842)} von ${n(2400)} übernommen (77 %)`}
                    center="77 %"
                  />
                }
              />
              <Kpi
                aria-label="Fortschritt Telko"
                label="Telko"
                value={n(611)}
                of={`/ ${n(1150)}`}
                delta={{ text: "+48 heute", tone: "good" }}
                ring={
                  <ProgressRing
                    value={611}
                    max={1150}
                    label={`Telko: ${n(611)} von ${n(1150)} übernommen (53 %)`}
                    center="53 %"
                  />
                }
              />
              <Kpi
                aria-label="Offene Klärfälle"
                label="Offene Klärfälle"
                value="14"
                delta={{ text: "+3 seit gestern", tone: "bad" }}
                aside={<Sparkline values={[6, 8, 7, 9, 11, 11, 14]} />}
              />
              <Kpi
                aria-label="Dead-Letter-Queue"
                label="Dead-Letter-Queue"
                value="6"
                delta={{ text: "−2 nach Redrive", tone: "good" }}
                aside={<Sparkline values={[3, 5, 9, 8, 8, 8, 6]} />}
              />
            </KpiGrid>
            <CockpitGrid>
              <Stack>
                <Card
                  as="section"
                  id="klaerfaelle"
                  title="Klärfälle"
                  actions={<a href="#alle">Alle anzeigen</a>}
                >
                  <DataTable
                    caption="Offene Klärfälle, neueste zuerst"
                    rows={CLARIFICATIONS}
                    rowKey={(row) => row.account}
                    columns={[
                      {
                        key: "account",
                        header: "Konto",
                        render: (row) => <span className="kp-mono">{row.account}</span>,
                      },
                      {
                        key: "name",
                        header: "Name",
                        render: (row) => `${row.name} (${row.system})`,
                      },
                      {
                        key: "problem",
                        header: "Problem",
                        render: (row) => <StatusBadge tone="warn">{row.problem}</StatusBadge>,
                      },
                      { key: "at", header: "Stand", render: (row) => row.at },
                    ]}
                  />
                </Card>
                <Card as="section" title="Demo-Pass t.richter@example.net">
                  <MiniBars
                    items={[
                      { label: "API", percent: 25 },
                      { label: "Ev.", percent: 81 },
                      { label: "Up.", percent: 15 },
                    ]}
                  />
                </Card>
              </Stack>
              <Stack>
                <Card
                  as="section"
                  id="ereignisse"
                  title="Ereignis-Timeline"
                  actions={<span className="kp-muted">7 Tage</span>}
                >
                  <Timeline items={EVENTS} />
                </Card>
                <Card as="section" tone="danger" title="Demo zurücksetzen" headingLevel={2}>
                  <p className="kp-muted">
                    Entfernt die Portal-Konten, die die Migration angelegt hat, sowie Läufe und die
                    DLQ. Die Altsysteme behalten ihre Daten.
                  </p>
                  <Button variant="secondary">Demo zurücksetzen …</Button>
                </Card>
              </Stack>
            </CockpitGrid>
          </Stack>
        </Page>
      </main>
    );
  },
};

export const CockpitKennzahlenDark: Story = {
  name: "Cockpit-Kennzahlen (Kontrast, dunkel)",
  parameters: { layout: "fullscreen" },
  globals: { preset: "kontrast", mode: "dark" },
  render: (args, context) => <>{CockpitKennzahlen.render?.(args, context)}</>,
};

export const CockpitKennzahlenPhone: Story = {
  name: "Cockpit-Kennzahlen (360 px)",
  parameters: { layout: "fullscreen" },
  globals: { preset: "dicht", viewport: { value: "phone360" } },
  render: (args, context) => <>{CockpitKennzahlen.render?.(args, context)}</>,
};
