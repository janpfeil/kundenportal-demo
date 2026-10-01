// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import { BulkStart } from "./bulk-start";
import { DemoReset } from "./demo-reset";
import { RedriveForm } from "./redrive-form";

const sendJson = vi.fn();
const refresh = vi.fn();
vi.mock("@kundenportal/web-auth/browser", () => ({
  sendJson: (...args: unknown[]) => sendJson(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => vi.clearAllMocks());

describe("bulk start", () => {
  it("starts the telco import and reports a running one", async () => {
    sendJson
      .mockResolvedValueOnce({ ok: true, status: 202 })
      .mockResolvedValueOnce({ ok: false, status: 409 });
    render(<BulkStart texts={{ bulk: de.bulk, systems: de.systems }} />);
    // As in the mockup: Versorger first (primary), then Telko.
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Import Versorger starten",
      "Import Telko starten",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Import Telko starten" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(de.bulk.started));
    expect(sendJson).toHaveBeenCalledWith("POST", "/cockpit/api/bulk", { system: "telco" });
    expect(refresh).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Import Telko starten" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(de.bulk.running));
  });

  it("disables the system whose import is running and points to the hint", () => {
    render(
      <>
        <p id="hint">Für Telko läuft bereits ein Import.</p>
        <BulkStart
          texts={{ bulk: de.bulk, systems: de.systems }}
          running={["telco"]}
          hintId="hint"
        />
      </>,
    );
    const telco = screen.getByRole("button", { name: "Import Telko starten" });
    expect(telco).toBeDisabled();
    expect(telco).toHaveAccessibleDescription("Für Telko läuft bereits ein Import.");
    expect(screen.getByRole("button", { name: "Import Versorger starten" })).toBeEnabled();
  });
});

describe("redrive form", () => {
  it("offers a correction only for the missing field and sends it", async () => {
    sendJson.mockResolvedValue({ ok: true, status: 202 });
    render(
      <RedriveForm
        recordId="dGVsY28"
        fields={["postalCode"]}
        texts={de.deadLetters}
        legend="Korrektur für T/88-4714"
      />,
    );
    expect(screen.getByRole("group", { name: "Korrektur für T/88-4714" })).toBeDefined();
    expect(screen.queryByLabelText(de.deadLetters.email)).toBeNull();
    fireEvent.change(screen.getByLabelText(de.deadLetters.postalCode), {
      target: { value: "04229" },
    });
    fireEvent.click(screen.getByRole("button", { name: de.deadLetters.redrive }));
    await waitFor(() => expect(screen.getByText(de.deadLetters.queued)).toBeDefined());
    expect(sendJson).toHaveBeenCalledWith("POST", "/cockpit/api/dlq/dGVsY28/redrive", {
      corrections: { postalCode: "04229" },
    });
  });

  it("redrives without corrections when nothing is correctable", async () => {
    sendJson.mockResolvedValue({ ok: false, status: 409 });
    render(<RedriveForm recordId="x" fields={[]} texts={de.deadLetters} />);
    expect(screen.getByText(de.deadLetters.noCorrection)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: de.deadLetters.redrive }));
    await waitFor(() => expect(screen.getByText(de.deadLetters.failed)).toBeDefined());
    expect(sendJson).toHaveBeenCalledWith("POST", "/cockpit/api/dlq/x/redrive", {
      corrections: {},
    });
  });
});

describe("demo reset", () => {
  it("asks for a second click and reports what was removed", async () => {
    sendJson.mockResolvedValue({
      ok: true,
      status: 200,
      data: { accountsRemoved: 3, recordsRemoved: 12 },
    });
    render(<DemoReset texts={de.reset} />);
    fireEvent.click(screen.getByRole("button", { name: de.reset.start }));
    expect(sendJson).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: de.reset.confirm }));
    await waitFor(() =>
      expect(screen.getByText("Zurückgesetzt: 3 Konten und 12 Einträge entfernt.")).toBeDefined(),
    );
    expect(sendJson).toHaveBeenCalledWith("POST", "/cockpit/api/reset", {});
  });
});
