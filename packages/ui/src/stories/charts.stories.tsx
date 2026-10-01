import type { Meta, StoryObj } from "@storybook/react-vite";
import { BarChart } from "../components/bar-chart.js";
import { Button, ButtonLink } from "../components/button.js";
import { MiniBars, ProgressRing, Sparkline } from "../components/charts.js";
import { NumberField } from "../components/fields.js";
import { Grid, Split, Stack } from "../components/grid.js";
import { divisionIcon } from "../components/icon.js";
import { Kpi } from "../components/kpi.js";
import { Card, Page } from "../components/page.js";
import { FakeMarker } from "../components/status.js";
import { Tabs } from "../components/tabs.js";
import { formatNumber } from "../format.js";
import { storyTexts } from "./texts.js";

/**
 * Charts of the consumption page and the cockpit, with the demo data of the design mockup
 * (docs/design/mockups.html). Switch preset and mode in the toolbar; the language switches
 * number formats and the shared texts (legend, table toggle, demo marker).
 */
const meta: Meta = {
  title: "Charts",
};

export default meta;
type Story = StoryObj;

const MONTHS = {
  de: ["Okt", "Nov", "Dez", "Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep"],
  en: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"],
};
const POWER = [215, 248, 281, 296, 262, 238, 205, 186, 172, 168, 175, 189];
const POWER_PREVIOUS = [228, 262, 300, 312, 275, 250, 214, 190, 180, 176, 182, 198];
const GAS = [820, 1240, 1560, 1690, 1410, 1120, 640, 310, 160, 120, 130, 290];
const GAS_PREVIOUS = [880, 1310, 1620, 1750, 1480, 1190, 700, 350, 170, 130, 140, 320];
/** After the last reading (1 July) the service estimates the months from the yearly value. */
const ESTIMATED = [...Array(9).fill(false), true, true, true] as boolean[];

export const BarChartStory: Story = {
  name: "BarChart",
  render: (_, { globals }) => {
    const { locale } = storyTexts(globals);
    return (
      <Card title="Strom · Zähler 1ESY 1160 4471 23" headingLevel={2}>
        <BarChart
          locale={locale}
          title="Stromverbrauch je Monat, Oktober 2025 bis September 2026, im Vergleich zum Vorjahr"
          unit="kWh"
          rangeLabel="Okt 2025 – Sep 2026"
          labels={MONTHS[locale]}
          values={POWER}
          previous={POWER_PREVIOUS}
        />
      </Card>
    );
  },
};

/** Months without a pair of readings are estimated: hatched, with a legend entry. */
export const BarChartEstimated: Story = {
  name: "BarChart (estimated months)",
  render: (_, { globals }) => {
    const { locale } = storyTexts(globals);
    return (
      <Card title="Strom · geschätzte Monate">
        <BarChart
          locale={locale}
          title="Stromverbrauch je Monat; Juli bis September geschätzt"
          unit="kWh"
          rangeLabel="Okt 2025 – Sep 2026"
          labels={MONTHS[locale]}
          values={POWER}
          previous={POWER_PREVIOUS}
          estimated={ESTIMATED}
        />
      </Card>
    );
  },
};

export const BarChartPhone: Story = {
  name: "BarChart (360 px)",
  render: (args, context) => <>{BarChartEstimated.render?.(args, context)}</>,
  globals: { viewport: { value: "phone360" } },
};

export const ProgressRings: Story = {
  name: "ProgressRing",
  render: (_, { globals }) => {
    const { locale } = storyTexts(globals);
    const n = (value: number) => formatNumber(value, locale);
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
        <ProgressRing
          value={1842}
          max={2400}
          label={`Versorger: ${n(1842)} von ${n(2400)} übernommen (77 %)`}
          center="77 %"
        />
        <ProgressRing
          value={611}
          max={1150}
          label={`Telko: ${n(611)} von ${n(1150)} übernommen (53 %)`}
          center="53 %"
        />
        <ProgressRing
          value={31}
          max={48}
          size={128}
          label="Laufzeit: noch 31 von 48 Stunden"
          center="31 Std."
          sub="von 48 Std."
        />
        <ProgressRing value={0} max={20} label="Datenvolumen: nichts verbraucht" center="0 GB" />
      </div>
    );
  },
};

export const Sparklines: Story = {
  name: "Sparkline",
  render: () => (
    <div style={{ display: "grid", gap: 16, justifyItems: "start" }}>
      <Sparkline
        values={[281, 296, 262, 238, 205, 186, 172, 168, 175, 189]}
        width={220}
        height={40}
      />
      <Sparkline values={[6, 8, 7, 9, 11, 11, 14]} label="Offene Klärfälle, 7 Tage: 6 bis 14" />
      <Sparkline values={[3, 5, 9, 8, 8, 8, 6]} />
      <Sparkline values={[4, 4, 4]} label="Gleichbleibend 4" />
      <Sparkline values={[7]} label="Ein Wert" />
    </div>
  ),
};

export const MiniBarsStory: Story = {
  name: "MiniBars",
  render: () => (
    <Stack>
      <MiniBars
        items={[
          { label: "API", percent: 25 },
          { label: "Ev.", percent: 81 },
          { label: "Up.", percent: 15 },
        ]}
      />
      <MiniBars
        items={[
          { label: "API", percent: 100 },
          { label: "Ev.", percent: 64 },
          { label: "Up.", percent: 40 },
        ]}
      />
    </Stack>
  ),
};

/**
 * The consumption page of the mockup: tabs per contract, key figures, the monthly chart
 * with its table, the reading form; mobile shows the data volume as a demo value.
 */
export const Verbrauch: Story = {
  name: "Verbrauch (composed)",
  parameters: { layout: "fullscreen" },
  render: (_, { globals }) => {
    const { locale } = storyTexts(globals);
    const months = MONTHS[locale];
    const power = (
      <Stack gap="large">
        <Grid min="180px">
          <Kpi
            label="Letzter Stand"
            value={`${formatNumber(48213, locale)} kWh`}
            hint="am 01.10.2026 · Ihre Angabe"
          />
          <Kpi
            label="Letzte 12 Monate"
            value={`${formatNumber(2635, locale)} kWh`}
            delta={{ text: "−4,1 % zum Vorjahr", tone: "good" }}
          />
          <Kpi label="Ø pro Monat" value="220 kWh" hint="≈ 71 € bei 32,4 ct/kWh" />
        </Grid>
        <Split>
          <Card as="section" title="Strom · Zähler 1ESY 1160 4471 23" headingLevel={2}>
            <BarChart
              locale={locale}
              title="Stromverbrauch je Monat, Oktober 2025 bis September 2026, im Vergleich zum Vorjahr"
              unit="kWh"
              rangeLabel="Okt 2025 – Sep 2026"
              labels={months}
              values={POWER}
              previous={POWER_PREVIOUS}
              estimated={ESTIMATED}
            />
          </Card>
          <Card as="section" title="Zählerstand erfassen">
            <p className="kp-muted">Letzter Stand: 48.213 kWh am 01.10.2026</p>
            <NumberField label="Zählerstand" unit="kWh" name="value" />
            <Button>Zählerstand senden</Button>
          </Card>
        </Split>
      </Stack>
    );
    const gas = (
      <Card as="section" title="Gas · Zähler 7GMT 0021 0918">
        <BarChart
          locale={locale}
          title="Gasverbrauch je Monat, Oktober 2025 bis September 2026, im Vergleich zum Vorjahr"
          unit="kWh"
          rangeLabel="Okt 2025 – Sep 2026"
          labels={months}
          values={GAS}
          previous={GAS_PREVIOUS}
        />
      </Card>
    );
    const mobile = (
      <Card as="section" title="Datenvolumen · Mobil 20 GB">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <ProgressRing
            value={12.4}
            max={20}
            size={140}
            label="Datenvolumen: 12,4 von 20 GB verbraucht (Demo-Wert)"
            center="12,4"
            sub="von 20 GB"
          />
          <Stack>
            <p>
              Noch 7,6 GB übrig, danach gedrosselt auf 64 kbit/s. <FakeMarker locale={locale} />
            </p>
            <div>
              <Button variant="secondary">1 GB nachbuchen</Button> <FakeMarker locale={locale} />
            </div>
          </Stack>
        </div>
      </Card>
    );
    return (
      <main className="kp-main">
        <Page
          title="Verbrauch"
          lead="Zählerstände erfassen und den Verlauf ansehen; bei Mobilfunk das Datenvolumen des Monats."
        >
          <Tabs
            label="Verträge"
            items={[
              { id: "strom", label: "Strom", icon: divisionIcon("electricity"), panel: power },
              { id: "gas", label: "Gas", icon: divisionIcon("gas"), panel: gas },
              { id: "mobil", label: "Mobilfunk", icon: divisionIcon("mobile"), panel: mobile },
            ]}
          />
          <p>
            <ButtonLink href="#vertraege" variant="secondary">
              Alle Verträge
            </ButtonLink>
          </p>
        </Page>
      </main>
    );
  },
};

export const VerbrauchPhone: Story = {
  name: "Verbrauch (360 px)",
  parameters: { layout: "fullscreen" },
  render: (args, context) => <>{Verbrauch.render?.(args, context)}</>,
  globals: { viewport: { value: "phone360" } },
};
