// @vitest-environment jsdom
import type { Contract, DataUsage, MeterReading } from "@kundenportal/api-contract";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import { ContractTabs } from "./contract-tabs";
import { type ConsumptionHistory, MeteredPanel } from "./metered-panel";
import { ReadingForm } from "./reading-form";
import { UsagePanel } from "./usage-panel";

const refresh = vi.fn();
vi.mock("@kundenportal/web-auth/browser", () => ({ sendJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const plain = (text: string | null | undefined) => (text ?? "").replace(/[\u00a0\u202f]/g, " ");
const ID = "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11";

const electricity: Contract = {
  contractId: ID,
  division: "electricity",
  tariffName: "Strom Klassik",
  tariffOption: "standard",
  tariffOptions: ["standard", "oeko"],
  monthlyInstallmentCent: 8700,
  installmentAdjustable: true,
  meterNumber: "1ESY 1160 4471 23",
  unit: "kWh",
  workPriceCent: 32.4,
  monthlyPriceCent: 1290,
  startDate: "2019-03-01",
  minimumTermMonths: 24,
  minimumTermEndDate: "2027-12-31",
  status: "active",
  updatedAt: "2026-10-01T10:00:00.000Z",
};

const latestReading: MeterReading = {
  readingId: "r-2",
  value: 48213,
  unit: "kWh",
  readAt: "2026-10-01",
  source: "customer",
  submittedAt: "2026-10-01T08:00:00Z",
};

const readings: MeterReading[] = [
  latestReading,
  {
    readingId: "r-1",
    value: 31004,
    unit: "kWh",
    readAt: "2019-03-01",
    source: "contract-start",
    submittedAt: "2019-03-01T08:00:00Z",
  },
];

const months = Array.from({ length: 12 }, (_, index) => {
  const date = new Date(Date.UTC(2025, 9 + index, 1));
  return {
    month: date.toISOString().slice(0, 7),
    value: 220,
    previousYear: 229,
    basis: index === 11 ? ("estimate" as const) : ("readings" as const),
    previousBasis: "readings" as const,
  };
});

const history: ConsumptionHistory = {
  contractId: ID,
  unit: "kWh",
  months,
  total: 2635,
  previousTotal: 2748,
  changePercent: -4.1,
  averagePerMonth: 220,
  latestReading,
  nextReadingDue: "2027-01-01",
  readingDue: false,
  plausibleRange: { min: 48250, max: 48400, at: "2026-10-01" },
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

function renderMetered(overrides: Partial<Parameters<typeof MeteredPanel>[0]> = {}) {
  return render(
    <MeteredPanel
      contract={electricity}
      readings={readings}
      history={history}
      today="2026-10-01"
      locale="de"
      t={de}
      loginHref="/auth/login"
      {...overrides}
    />,
  );
}

describe("MeteredPanel", () => {
  it("shows the mockup's three key figures from the API's numbers", () => {
    const { container } = renderMetered();
    const kpis = [...container.querySelectorAll(".kp-kpi")].map((kpi) => plain(kpi.textContent));
    expect(kpis).toEqual([
      "Letzter Stand48.213 kWham 01.10.2026 · Ihre Angabe",
      "Letzte 12 Monate2.635 kWh−4,1 % zum Vorjahr1 von 12 Monaten geschätzt",
      "Ø pro Monat220 kWh≈ 71 € bei 32,4 ct/kWh",
    ]);
    expect(container.querySelector(".kp-kpi-delta-good")).toHaveTextContent("zum Vorjahr");
  });

  it("leaves out the change without a previous year and the cost without a unit price", () => {
    const { changePercent: _change, ...withoutChange } = history;
    const { workPriceCent: _price, ...withoutPrice } = electricity;
    const { container } = renderMetered({ history: withoutChange, contract: withoutPrice });
    expect(container.querySelector(".kp-kpi-delta")).toBeNull();
    expect(container).not.toHaveTextContent("≈");
  });

  it("draws 12 months with the previous year and the estimated month in the legend", () => {
    renderMetered();
    expect(
      screen.getByRole("heading", { level: 2, name: "Strom · Zähler 1ESY 1160 4471 23" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Strom: Verbrauch pro Monat, Okt 2025 – Sep 2026" }),
    ).toBeInTheDocument();
    const legend = document.querySelector(".kp-chart-legend");
    expect(plain(legend?.textContent)).toBe("Okt 2025 – Sep 2026Vorjahrgeschätzt");
    const table = screen.getByRole("table", { name: /Verbrauch pro Monat/ });
    expect(within(table).getAllByRole("row")).toHaveLength(13);
  });

  it("keeps the readings marker for the journeys and lists the readings with their source", () => {
    renderMetered();
    const marker = screen.getByTestId("readings");
    expect(marker).toHaveAttribute("data-contract-id", ID);
    expect(marker).toHaveAttribute("data-latest-value", "48213");
    const table = within(marker).getByRole("table", { name: "Zählerstände, neueste zuerst" });
    expect(within(table).getByText("Vertragsbeginn")).toBeInTheDocument();
    expect(screen.getByTestId("reading-form")).toHaveTextContent(
      "Letzter Stand: 48.213 kWh am 01.10.2026",
    );
    expect(screen.getByTestId("meter-photo-upload")).toBeInTheDocument();
  });

  it("explains a missing history instead of the chart and offers no form for ended contracts", () => {
    renderMetered({ history: undefined, contract: { ...electricity, status: "terminated" } });
    expect(screen.getByRole("alert")).toHaveTextContent(de.chart.error);
    expect(screen.queryByTestId("reading-form")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(de.meter.inactive)).toBeInTheDocument();
  });
});

describe("ReadingForm plausibility hint", () => {
  it("warns while typing a value outside the expected range, but still lets it be sent", () => {
    render(
      <ReadingForm
        contractId={ID}
        unit="kWh"
        latest={{ value: 48213, readAt: "2026-09-01" }}
        today="2026-10-01"
        plausibleRange={history.plausibleRange}
        locale="de"
        texts={de.reading}
        loginHref="/auth/login"
      />,
    );
    const value = screen.getByRole("spinbutton", { name: "Zählerstand" });
    fireEvent.change(value, { target: { value: "48300" } });
    expect(screen.queryByText(/nicht plausibel/)).not.toBeInTheDocument();
    fireEvent.change(value, { target: { value: "48390" } });
    expect(screen.queryByText(/nicht plausibel/)).not.toBeInTheDocument();
    fireEvent.change(value, { target: { value: "49000" } });
    expect(value).toHaveAccessibleDescription(
      /Der Zählerstand ist nicht plausibel\. Bitte prüfen Sie Wert und Datum\. Erwartet für heute: etwa 48\.250 kWh bis 48\.400 kWh\./,
    );
    // A hint, not an error: the field stays valid and no status message competes.
    expect(value).not.toBeInvalid();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("UsagePanel", () => {
  const mobile: Contract = {
    ...electricity,
    division: "mobile",
    tariffName: "Mobil 20 GB",
    dataVolumeMb: 20480,
  };
  const usage: DataUsage = {
    contractId: ID,
    month: "2026-10",
    includedMb: 20480,
    usedMb: 12698,
    usedPercent: 62,
    thresholdPercent: 80,
    asOf: "2026-10-01T10:00:00.000Z",
  };

  it("shows the data volume ring and the fake top-up, both marked as demo values", () => {
    const { container } = render(<UsagePanel contract={mobile} usage={usage} locale="de" t={de} />);
    const ring = screen.getByRole("img", { name: /Datenvolumen: 12,4\sGB von 20\sGB verbraucht/ });
    expect(plain(ring.textContent)).toBe("12,4von 20 GB");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Datenvolumen · Mobil 20 GB",
    );
    expect(plain(screen.getByTestId("usage").textContent)).toContain(
      "Abrechnungszeitraum 01.–31.10.2026. Noch 7,6 GB übrig.",
    );
    const topUp = screen.getByRole("button", { name: "1 GB nachbuchen" });
    expect(topUp).toBeDisabled();
    expect(topUp).toHaveAccessibleDescription(/in der Demo nicht möglich/);
    expect(container.querySelectorAll('[data-fake="true"]')).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns from the threshold on", () => {
    render(
      <UsagePanel
        contract={mobile}
        usage={{ ...usage, usedMb: 17000, usedPercent: 83 }}
        locale="de"
        t={de}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("83 % Ihres Datenvolumens");
  });
});

describe("ContractTabs", () => {
  it("opens the tab chosen by the server and writes the choice into the address", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(
      <ContractTabs
        label="Verträge"
        defaultTab="g"
        items={[
          { id: "e", label: "Strom", icon: "bolt", panel: <p>Strom-Inhalt</p> },
          { id: "g", label: "Gas", icon: "flame", panel: <p>Gas-Inhalt</p> },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Gas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Gas-Inhalt")).toBeVisible();
    // Hidden panels stay in the markup (the journeys read their markers).
    expect(screen.getByText("Strom-Inhalt")).not.toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Strom" }));
    expect(screen.getByText("Strom-Inhalt")).toBeVisible();
    const url = replaceState.mock.calls.at(-1)?.[2];
    expect(String(url)).toMatch(/\?vertrag=e$/);
  });
});
