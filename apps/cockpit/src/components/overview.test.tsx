// @vitest-environment jsdom
import type { MigrationStatus } from "@kundenportal/api-contract";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import {
  ClarificationsCard,
  CockpitKpis,
  DeadLettersCard,
  RunsCard,
  TimelineCard,
} from "./overview";

vi.mock("@kundenportal/web-auth/browser", () => ({ sendJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/cockpit${href}`} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => vi.clearAllMocks());

// 1 October 2026, 10:42 in Germany.
const NOW = new Date("2026-10-01T08:42:00Z");

const record = (index: number, status: "clarification" | "failed" = "clarification") => ({
  id: `r${index}`,
  system: index % 2 ? ("telco" as const) : ("utility" as const),
  customerNumber: index % 2 ? `T/88-47${10 + index}` : `V-10001${10 + index}`,
  displayName: `Person ${index}`,
  status,
  code: "invalid-field" as const,
  message: `Invalid email address "x${index}"`,
  fields: status === "failed" ? ["postalCode"] : ["email"],
  attempts: 3,
  updatedAt: `2026-10-01T08:${String(40 - index).padStart(2, "0")}:00Z`,
});

const status: MigrationStatus = {
  systems: [
    {
      system: "utility",
      total: 2400,
      migratedToday: 126,
      counts: { migrated: 1800, linked: 42, clarification: 7 },
    },
    { system: "telco", migratedToday: 0, counts: { migrated: 611 } },
  ],
  clarifications: [1, 2, 3, 4, 5, 6, 7].map((index) => record(index)),
  deadLetters: [record(14, "failed"), record(15, "failed")],
  runs: [
    {
      runId: "run-1",
      system: "utility",
      status: "completed",
      startedAt: "2026-09-30T15:05:00Z",
      startedBy: "owner",
      processed: 1204,
      dispatched: 1204,
      counts: {
        read: 1204,
        migrated: 1122,
        skippedActive: 61,
        alreadyMigrated: 0,
        clarification: 6,
        failed: 15,
      },
    },
    {
      runId: "run-2",
      system: "telco",
      status: "running",
      startedAt: "2026-10-01T08:31:00Z",
      startedBy: "owner",
      processed: 412,
      dispatched: 710,
      counts: {
        read: 412,
        migrated: 371,
        skippedActive: 29,
        alreadyMigrated: 0,
        clarification: 8,
        failed: 4,
      },
    },
  ],
  timeline: [
    {
      eventId: "e1",
      source: "kundenportal.migration",
      detailType: "LegacyAccountMigrated",
      occurredAt: "2026-10-01T08:41:00Z",
      summary: "utility:V-1000118 lazy",
    },
    {
      eventId: "e2",
      source: "kundenportal.migration",
      detailType: "MigrationRecordFailed",
      occurredAt: "2026-09-30T08:29:00Z",
      summary: "telco:T/88-4714 bulk",
    },
  ],
  trends: {
    days: [],
    clarifications: [6, 8, 7, 9, 11, 11, 14],
    deadLetters: [3, 5, 9, 8, 8, 8, 6],
    newClarifications: 3,
    redriven: 2,
  },
};

describe("cockpit key figures", () => {
  it("shows rings with done / total and today, and the open counts with their change", () => {
    render(<CockpitKpis status={status} t={de} locale="de" />);
    const progress = screen.getByTestId("progress");
    const utility = within(progress).getByRole("region", { name: "Fortschritt Versorger" });
    expect(utility).toHaveAttribute("data-system", "utility");
    expect(utility).toHaveAttribute("data-done", "1842");
    expect(utility).toHaveAttribute("data-total", "2400");
    expect(utility).toHaveTextContent("1.842 / 2.400");
    expect(utility).toHaveTextContent("+126 heute");
    expect(
      within(utility).getByRole("img", { name: "Versorger: 1.842 von 2.400 übernommen (77 %)" }),
    ).toBeDefined();
    // The telco legacy system is unreachable: no total, no share.
    const telco = within(progress).getByRole("region", { name: "Fortschritt Telko" });
    expect(telco).toHaveAttribute("data-total", "");
    expect(telco).toHaveTextContent(de.kpis.unknown);
    const clarifications = screen.getByRole("region", { name: "Offene Klärfälle" });
    expect(clarifications).toHaveTextContent("7");
    expect(within(clarifications).getByText("+3 seit gestern")).toHaveClass("kp-kpi-delta-bad");
    expect(
      within(clarifications).getByRole("img", {
        name: "Verlauf der letzten 7 Tage: 6, 8, 7, 9, 11, 11, 14",
      }),
    ).toBeDefined();
    const dlq = screen.getByRole("region", { name: "Dead-Letter-Queue" });
    expect(within(dlq).getByText("−2 nach Redrive")).toHaveClass("kp-kpi-delta-good");
  });
});

describe("cockpit cards", () => {
  it("lists the runs newest first with a progress bar while running", () => {
    render(<RunsCard status={status} t={de} locale="de" />);
    const runs = screen.getByTestId("runs");
    const [, running, completed] = within(runs).getAllByRole("row") as HTMLElement[];
    if (!running || !completed) throw new Error("two runs expected");
    const rows = [running, completed];
    expect(rows[0]).toHaveTextContent("01.10. 10:31");
    expect(within(running).getByText("läuft")).toHaveClass("kp-status-info", "kp-status-pulse");
    expect(within(running).getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "412 von 710 verarbeitet",
    );
    expect(within(completed).getByText("abgeschlossen")).toHaveClass("kp-status-ok");
    expect(rows[1]).toHaveTextContent("1.204 gelesen · 1.122 übernommen");
    // A running telco import disables its button and says why.
    expect(
      screen.getByRole("button", { name: "Import Telko starten" }),
    ).toHaveAccessibleDescription(/Für Telko läuft bereits ein Import\./);
  });

  it("shows five clarification cases with a link to all of them", () => {
    const { rerender } = render(
      <ClarificationsCard status={status} t={de} locale="de" all={false} now={NOW} />,
    );
    const card = screen.getByRole("region", { name: "Klärfälle 7" });
    expect(card).toHaveAttribute("id", "klaerfaelle");
    expect(within(screen.getByTestId("clarifications")).getAllByRole("row")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Alle anzeigen" })).toHaveAttribute(
      "href",
      "/cockpit/?klaerfaelle=alle#klaerfaelle",
    );
    const first = within(screen.getByTestId("clarifications")).getAllByRole("row")[1];
    if (!first) throw new Error("rows expected");
    expect(first).toHaveTextContent("T/88-4711");
    expect(first).toHaveTextContent("Person 1Telko");
    expect(within(first).getByText("keine gültige E-Mail")).toHaveClass("kp-status-warn");
    expect(within(first).getByText("10:39")).toBeDefined();

    rerender(<ClarificationsCard status={status} t={de} locale="de" all now={NOW} />);
    expect(within(screen.getByTestId("clarifications")).getAllByRole("row")).toHaveLength(8);
    expect(screen.getByRole("link", { name: "Weniger anzeigen" })).toBeDefined();
  });

  it("opens the first dead letter for correction and toggles the others", () => {
    render(<DeadLettersCard status={status} t={de} locale="de" />);
    const table = screen.getByTestId("dead-letters");
    // The row of an account, found by its number as the live E2E does, holds the form.
    const rows = within(table).getAllByRole("row", { name: /V-1000124/ });
    expect(rows.length).toBeGreaterThan(0);
    const form = within(table).getByRole("group", { name: "Korrektur für V-1000124" });
    expect(within(form).getByLabelText(de.deadLetters.postalCode)).toBeDefined();
    expect(within(form).getByRole("button", { name: "Erneut verarbeiten" })).toBeDefined();
    const second = within(table).getByRole("button", { name: "T/88-4725 korrigieren" });
    expect(second).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(second);
    expect(within(table).getByRole("group", { name: "Korrektur für T/88-4725" })).toBeDefined();
    fireEvent.click(
      within(table).getByRole("button", { name: "Korrektur von V-1000124 schließen" }),
    );
    expect(within(table).queryByRole("group", { name: "Korrektur für V-1000124" })).toBeNull();
  });

  it("shows events with icon, title in words, type, ids and time", () => {
    render(<TimelineCard status={status} t={de} locale="de" now={NOW} />);
    const timeline = screen.getByTestId("timeline");
    const [migrated, failed] = within(timeline).getAllByRole("listitem");
    expect(migrated).toHaveTextContent("Konto übernommen");
    expect(migrated).toHaveTextContent("LegacyAccountMigrated");
    expect(migrated).toHaveTextContent("utility:V-1000118 lazy");
    expect(migrated).toHaveTextContent("10:41");
    expect(migrated?.querySelector(".kp-timeline-ok")).not.toBeNull();
    expect(failed).toHaveTextContent("Datensatz in DLQ");
    expect(failed).toHaveTextContent("30.09. 10:29");
    expect(failed?.querySelector(".kp-timeline-err")).not.toBeNull();
    expect(screen.getByRole("region", { name: "Ereignis-Timeline" })).toHaveAttribute(
      "id",
      "ereignisse",
    );
  });
});
