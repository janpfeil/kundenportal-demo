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
    fireEvent.click(screen.getByRole("button", { name: "Import Telko starten" }));
    await waitFor(() => expect(screen.getByText(de.bulk.started)).toBeDefined());
    expect(sendJson).toHaveBeenCalledWith("POST", "/cockpit/api/bulk", { system: "telco" });
    expect(refresh).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Import Telko starten" }));
    await waitFor(() => expect(screen.getByText(de.bulk.running)).toBeDefined());
  });
});

describe("redrive form", () => {
  it("offers a correction only for the missing field and sends it", async () => {
    sendJson.mockResolvedValue({ ok: true, status: 202 });
    render(<RedriveForm recordId="dGVsY28" fields={["postalCode"]} texts={de.deadLetters} />);
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
