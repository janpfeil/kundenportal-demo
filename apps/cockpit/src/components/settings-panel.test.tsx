// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import { SettingsPanel } from "./settings-panel";

const sendJson = vi.fn();
vi.mock("@kundenportal/web-auth/browser", () => ({
  sendJson: (...args: unknown[]) => sendJson(...args),
}));

beforeEach(() => vi.clearAllMocks());

const texts = de.passes.settings;
const closed = {
  redemption: "closed" as const,
  closedAt: "2026-09-30T08:00:00.000Z",
  closedReason: "Budget-Alarm: 80 % des Monatsbudgets",
  maxTenants: 3,
  activeTenants: 1,
};

describe("settings panel", () => {
  it("shows why redemption is closed and reopens it", async () => {
    sendJson.mockResolvedValue({
      ok: true,
      status: 200,
      data: { redemption: "open", maxTenants: 3, activeTenants: 1 },
    });
    render(<SettingsPanel settings={closed} texts={texts} locale="de" />);
    expect(screen.getByText("gesperrt")).toBeInTheDocument();
    expect(screen.getByTestId("closed-reason")).toHaveTextContent("Budget-Alarm");
    expect(screen.getByText(/30\.09\.2026, 10:00:00/)).toBeInTheDocument();
    expect(screen.getByTestId("active-tenants")).toHaveTextContent("1 von 3");

    fireEvent.click(screen.getByRole("button", { name: texts.reopen }));
    await waitFor(() => expect(screen.getByText("offen")).toBeInTheDocument());
    expect(sendJson).toHaveBeenCalledWith("PUT", "/cockpit/api/settings", { redemption: "open" });
    expect(screen.queryByTestId("closed-reason")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(texts.saved);
  });

  it("offers caps from 1 to 4 with the capacity explanation and saves a new one", async () => {
    sendJson.mockResolvedValue({
      ok: true,
      status: 200,
      data: { redemption: "open", maxTenants: 4, activeTenants: 3 },
    });
    render(
      <SettingsPanel
        settings={{ redemption: "open", maxTenants: 3, activeTenants: 3 }}
        texts={texts}
        locale="de"
      />,
    );
    // Full: all places taken.
    expect(screen.getByText(texts.full)).toBeInTheDocument();
    const select = screen.getByLabelText(texts.cap);
    expect(select).toHaveAccessibleDescription(texts.capHint);
    expect(Array.from((select as HTMLSelectElement).options).map((option) => option.value)).toEqual(
      ["1", "2", "3", "4"],
    );
    const save = screen.getByRole("button", { name: texts.saveCap });
    expect(save).toBeDisabled();
    fireEvent.change(select, { target: { value: "4" } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByTestId("active-tenants")).toHaveTextContent("3 von 4"));
    expect(sendJson).toHaveBeenCalledWith("PUT", "/cockpit/api/settings", { maxTenants: 4 });
    expect(screen.queryByText(texts.full)).not.toBeInTheDocument();
  });

  it("reports a failed change", async () => {
    sendJson.mockResolvedValue({ ok: false, status: 403 });
    render(<SettingsPanel settings={closed} texts={texts} locale="de" />);
    fireEvent.click(screen.getByRole("button", { name: texts.reopen }));
    expect(await screen.findByText(texts.failed)).toBeInTheDocument();
    expect(screen.getByText("gesperrt")).toBeInTheDocument();
  });

  it("keeps a stored cap of 0 visible instead of pretending it is 1", () => {
    render(
      <SettingsPanel
        settings={{ redemption: "open", maxTenants: 0, activeTenants: 0 }}
        texts={texts}
        locale="de"
      />,
    );
    expect(screen.getByLabelText(texts.cap)).toHaveValue("0");
    expect(screen.getByRole("button", { name: texts.saveCap })).toBeDisabled();
  });
});
