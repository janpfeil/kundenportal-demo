import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BarChart,
  Banner,
  Card,
  FakeMarker,
  Grid,
  ICON_NAMES,
  Icon,
  Kpi,
  KpiGrid,
  LiveIndicator,
  MessageList,
  Meter,
  MiniBars,
  Page,
  ProgressRing,
  Sparkline,
  StatusBadge,
  Timeline,
  divisionIcon,
  niceMaximum,
} from "../index.js";

describe("Icon", () => {
  it("is decorative by default and an image with a label", () => {
    const { container } = render(
      <>
        <Icon name="bolt" />
        <Icon name="alert" label="Warnung" />
      </>,
    );
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("img", { name: "Warnung" })).toHaveClass("kp-icon");
  });

  it("has the whole set of the mockup and an icon per division", () => {
    expect(ICON_NAMES).toHaveLength(38);
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector("svg")?.children.length).toBeGreaterThan(0);
      unmount();
    }
    expect(divisionIcon("electricity")).toBe("bolt");
    expect(divisionIcon("gas")).toBe("flame");
    expect(divisionIcon("water")).toBe("drop");
    expect(divisionIcon("internet")).toBe("wifi");
    expect(divisionIcon("mobile")).toBe("phone");
  });
});

describe("StatusBadge, LiveIndicator", () => {
  it("renders the text with tone and pulse classes", () => {
    render(
      <>
        <StatusBadge tone="ok" pulse>
          Aktiv
        </StatusBadge>
        <LiveIndicator>Aktualisiert sich alle 10 Sekunden · 10:42:18</LiveIndicator>
      </>,
    );
    expect(screen.getByText("Aktiv")).toHaveClass("kp-status", "kp-status-ok", "kp-status-pulse");
    expect(screen.getByText(/alle 10 Sekunden/)).toHaveClass("kp-live");
  });
});

describe("FakeMarker", () => {
  it("marks simulated values for people, screen readers and tools", () => {
    const { container } = render(<FakeMarker locale="de" />);
    const marker = container.querySelector("[data-fake]");
    expect(marker).toHaveAttribute("data-fake", "true");
    expect(marker).toHaveAttribute("title", "simuliert — noch nicht aus dem System");
    expect(marker).toHaveTextContent("Demo-Wert (simuliert — noch nicht aus dem System)");
    expect(marker?.querySelector(".kp-sr-only")).toHaveTextContent("simuliert");
  });

  it("speaks English", () => {
    const { container } = render(<FakeMarker locale="en" />);
    const marker = container.querySelector("[data-fake]");
    expect(marker).toHaveTextContent(/^Demo value/);
    expect(marker).toHaveAttribute("title", "simulated — not from the system yet");
  });
});

describe("ProgressRing", () => {
  it("is one image named by its label and clamps the arc", () => {
    const { container } = render(
      <ProgressRing value={3000} max={2400} label="Versorger: alle übernommen" center="100 %" />,
    );
    const ring = screen.getByRole("img", { name: "Versorger: alle übernommen" });
    expect(ring).toHaveTextContent("100 %");
    const arc = container.querySelector(".kp-ring-value");
    const [drawn, total] = (arc?.getAttribute("stroke-dasharray") ?? "").split(" ").map(Number);
    expect(drawn).toBeCloseTo(total ?? 0);
  });

  it("draws no arc at zero or without a maximum, and shows the sub text", () => {
    const { container } = render(
      <ProgressRing value={5} max={0} label="Laufzeit" center="0 Std." sub="von 48 Std." />,
    );
    expect(container.querySelector(".kp-ring-value")).toBeNull();
    expect(screen.getByRole("img", { name: "Laufzeit" })).toHaveTextContent("von 48 Std.");
  });
});

describe("Sparkline", () => {
  const coordinates = (svg: Element | null) =>
    [...(svg?.querySelectorAll("polyline, polygon, circle") ?? [])].flatMap((shape) =>
      [shape.getAttribute("points"), shape.getAttribute("cx"), shape.getAttribute("cy")].filter(
        (value): value is string => value !== null,
      ),
    );

  it("is decorative without a label and an image with one", () => {
    const { container } = render(<Sparkline values={[6, 8, 7, 9, 11, 11, 14]} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    render(<Sparkline values={[1, 2]} label="Klärfälle, 7 Tage" />);
    expect(screen.getByRole("img", { name: "Klärfälle, 7 Tage" })).toBeInTheDocument();
  });

  it.each([
    ["no values", []],
    ["one value", [5]],
    ["equal values", [3, 3, 3]],
    ["invalid values", [Number.NaN, 2, Number.POSITIVE_INFINITY, 4]],
  ])("copes with %s", (_, values) => {
    const { container } = render(<Sparkline values={values} />);
    expect(coordinates(container.querySelector("svg")).join(" ")).not.toMatch(/NaN|Infinity/);
  });

  it("draws a flat series in the middle", () => {
    const { container } = render(<Sparkline values={[3, 3, 3]} height={34} />);
    expect(container.querySelector(".kp-chart-dot")).toHaveAttribute("cy", "17");
  });
});

describe("BarChart", () => {
  const chart = (
    <BarChart
      locale="de"
      title="Stromverbrauch je Monat"
      unit="kWh"
      rangeLabel="Okt 2025 – Sep 2026"
      labels={["Jul", "Aug", "Sep"]}
      values={[1680, 175, 189]}
      previous={[176, null, 198]}
      estimated={[false, false, true]}
    />
  );

  it("names the chart and puts the same numbers in a table", () => {
    render(chart);
    expect(screen.getByRole("img", { name: "Stromverbrauch je Monat" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Stromverbrauch je Monat" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Monat", "kWh", "Vorjahr"]);
    expect(within(table).getByRole("rowheader", { name: "Jul" })).toBeInTheDocument();
    expect(within(table).getByText("1.680")).toBeInTheDocument();
    expect(within(table).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Als Tabelle anzeigen")).toBeInTheDocument();
  });

  it("marks estimated months in bars, table and legend", () => {
    const { container } = render(chart);
    const estimated = container.querySelectorAll(".kp-chart-bar-estimated");
    expect(estimated).toHaveLength(1);
    // Inline style, because the bar class's fill would beat a presentation attribute.
    const pattern = container.querySelector("pattern");
    expect(pattern?.id).toMatch(/^kp-hatch-/);
    expect(estimated[0]?.getAttribute("style")?.replace(/"/g, "")).toContain(
      `url(#${pattern?.id})`,
    );
    expect(container.querySelector('tr[data-estimated="true"]')).toHaveTextContent(
      "Sep189 (geschätzt)",
    );
    expect(
      [...container.querySelectorAll(".kp-chart-legend li")].map((item) => item.textContent),
    ).toEqual(["Okt 2025 – Sep 2026", "Vorjahr", "geschätzt"]);
    // Hover text per bar, and the latest value written above the last bar.
    expect(container.querySelector("g title")?.textContent).toBe(
      "Jul: 1.680 kWh (Vorjahr 176 kWh)",
    );
    expect(container.querySelector(".kp-chart-value")).toHaveTextContent("189");
  });

  it("breaks the comparison line at gaps and leaves out an empty legend", () => {
    const { container } = render(
      <BarChart
        locale="en"
        title="Gas"
        unit="kWh"
        labels={["a", "b", "c", "d"]}
        values={[0, 0, 0, 0]}
        previous={[1, null, 2, 3]}
      />,
    );
    expect(container.querySelectorAll(".kp-chart-previous")).toHaveLength(1);
    expect(container.querySelectorAll(".kp-chart-previous-dot")).toHaveLength(1);
    expect(container.querySelector(".kp-chart-legend")).toBeNull();
    expect(container.querySelectorAll(".kp-chart-bar")).toHaveLength(0);
    expect(screen.getByText("Show as table")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN/);
  });

  it("rounds the axis to 1, 2, 2.5 or 5 per step", () => {
    expect(niceMaximum(312)).toBe(400);
    expect(niceMaximum(1750)).toBe(2000);
    expect(niceMaximum(9)).toBe(10);
    expect(niceMaximum(0)).toBe(4);
  });
});

describe("MiniBars and Meter", () => {
  it("renders labelled meters with warning and error levels", () => {
    render(
      <MiniBars
        items={[
          { label: "API", percent: 25 },
          { label: "Ev.", percent: 81 },
          { label: "Up.", percent: 120 },
        ]}
      />,
    );
    const api = screen.getByRole("meter", { name: "API" });
    expect(api).toHaveAttribute("aria-valuenow", "25");
    expect(api).toHaveAttribute("aria-valuetext", "25 %");
    expect(screen.getByRole("meter", { name: "Ev." })).toHaveClass("kp-minibar-warning");
    const uploads = screen.getByRole("meter", { name: "Up." });
    expect(uploads).toHaveClass("kp-minibar-error");
    expect(uploads).toHaveAttribute("aria-valuenow", "100");
    expect(uploads).toHaveAttribute("aria-valuetext", "120 %");
  });

  it("offers a thin meter whose label only screen readers get", () => {
    const { container } = render(
      <Meter label="Aktive Pass-Mandanten" value={3} max={4} thin hideLabel />,
    );
    expect(screen.getByRole("meter", { name: "Aktive Pass-Mandanten" })).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("kp-meter-thin");
    expect(screen.getByText("Aktive Pass-Mandanten")).toHaveClass("kp-sr-only");
  });
});

describe("Kpi", () => {
  it("is a named section with value, part, change and aside", () => {
    render(
      <KpiGrid>
        <Kpi
          aria-label="Klärfälle"
          label="Offene Klärfälle"
          value="14"
          delta={{ text: "+3 seit gestern", tone: "bad" }}
          aside={<Sparkline values={[6, 8, 14]} />}
        />
        <Kpi
          aria-label="Fortschritt Versorger"
          label="Versorger"
          value="1.842"
          of="/ 2.400"
          ring={<ProgressRing value={1842} max={2400} label="77 %" center="77 %" />}
        />
        <Kpi label="Ø pro Monat" value="220 kWh" hint="≈ 71 € bei 32,4 ct/kWh" />
      </KpiGrid>,
    );
    const cases = screen.getByRole("region", { name: "Klärfälle" });
    expect(cases).toHaveTextContent("Offene Klärfälle14+3 seit gestern");
    expect(within(cases).getByText("+3 seit gestern")).toHaveClass("kp-kpi-delta-bad");
    const progress = screen.getByRole("region", { name: "Fortschritt Versorger" });
    expect(progress).toHaveClass("kp-kpi-ring");
    expect(within(progress).getByText("/ 2.400")).toHaveClass("kp-kpi-of");
    expect(screen.getByText("220 kWh").closest(".kp-kpi")?.tagName).toBe("DIV");
  });
});

describe("Timeline", () => {
  it("lists events with title, code, details and time", () => {
    render(
      <Timeline
        aria-label="Ereignisse"
        items={[
          {
            id: "1",
            icon: "check",
            tone: "ok",
            title: "Konto übernommen",
            code: "AccountMigrated",
            meta: ["VS-118 377"],
            time: <time dateTime="2026-10-01T10:41:00+02:00">10:41</time>,
          },
          { id: "2", icon: "link", title: "Konten verknüpft" },
        ]}
      />,
    );
    const items = within(screen.getByRole("list", { name: "Ereignisse" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Konto übernommenAccountMigratedVS-118 37710:41");
    expect(items[0]?.querySelector(".kp-timeline-ok")).not.toBeNull();
    expect(items[1]?.querySelector(".kp-timeline-neutral")).not.toBeNull();
  });
});

describe("MessageList", () => {
  it("marks unread messages for screen readers and the open one as current", () => {
    render(
      <MessageList
        locale="de"
        aria-label="Nachrichten"
        items={[
          {
            id: "a",
            href: "?n=a",
            title: "Zählerstand gespeichert",
            time: "09:14",
            preview: "Ihr Zählerstand ist eingegangen.",
            unread: true,
            current: true,
          },
          { id: "b", href: "?n=b", title: "Willkommen", time: "28.09." },
        ]}
      />,
    );
    const open = screen.getByRole("link", { name: /Zählerstand gespeichert/ });
    expect(open).toHaveAccessibleName(
      "ungelesen: Zählerstand gespeichert 09:14 Ihr Zählerstand ist eingegangen.",
    );
    expect(open).toHaveAttribute("aria-current", "page");
    expect(open).toHaveClass("kp-message-unread");
    const read = screen.getByRole("link", { name: /Willkommen/ });
    expect(read).not.toHaveAttribute("aria-current");
    expect(read).not.toHaveClass("kp-message-unread");
  });
});

describe("Banner, Grid", () => {
  it("renders icon, heading at the chosen level, text and action", () => {
    const { container } = render(
      <Grid min="230px" data-testid="grid">
        <Banner
          icon="bolt"
          title="Zählerstand Strom fällig"
          headingLevel={3}
          action={<a href="/verbrauch">Jetzt erfassen</a>}
        >
          Bitte melden Sie den Stand bis 15.10.2026.
        </Banner>
      </Grid>,
    );
    expect(screen.getByTestId("grid")).toHaveStyle({ "--kp-grid-min": "230px" });
    expect(
      screen.getByRole("heading", { level: 3, name: "Zählerstand Strom fällig" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/bis 15.10.2026/)).toHaveClass("kp-muted");
    expect(screen.getByRole("link", { name: "Jetzt erfassen" })).toBeInTheDocument();
    expect(container.querySelector(".kp-icon-circle svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Card and Page extensions", () => {
  it("keeps the plain card markup without the new options", () => {
    const { container } = render(<Card title="Adresse">Musterweg 1</Card>);
    const card = container.firstElementChild;
    expect(card?.tagName).toBe("DIV");
    expect(card?.firstElementChild).toHaveClass("kp-card-title");
    expect(card).not.toHaveAttribute("aria-labelledby");
  });

  it("names a section card by its title and adds actions, icon, id and danger tone", () => {
    render(
      <Card
        as="section"
        id="klaerfaelle"
        title="Klärfälle"
        icon="alert"
        tone="danger"
        actions={<a href="#alle">Alle anzeigen</a>}
      >
        Inhalt
      </Card>,
    );
    const region = screen.getByRole("region", { name: "Klärfälle" });
    expect(region).toHaveAttribute("id", "klaerfaelle");
    expect(region).toHaveClass("kp-card-danger");
    expect(within(region).getByRole("link", { name: "Alle anzeigen" }).parentElement).toHaveClass(
      "kp-card-actions",
    );
  });

  it("prefers an explicit aria-label", () => {
    render(
      <Card as="section" title="Status" aria-label="Status des Passes">
        x
      </Card>,
    );
    expect(screen.getByRole("region", { name: "Status des Passes" })).toBeInTheDocument();
  });

  it("puts eyebrow and aside around the page heading", () => {
    render(
      <Page
        title="Migrations-Cockpit"
        eyebrow="Migration"
        aside={<LiveIndicator>Aktualisiert sich alle 10 Sekunden</LiveIndicator>}
      />,
    );
    const heading = screen.getByRole("heading", { level: 1, name: "Migrations-Cockpit" });
    expect(heading.previousElementSibling).toHaveTextContent("Migration");
    expect(heading.closest(".kp-page-head")).toHaveTextContent("Aktualisiert");
  });
});
