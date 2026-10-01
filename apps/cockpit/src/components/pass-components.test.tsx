// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import { InvitationForm } from "./invitation-form";
import { RevokeButton } from "./revoke-button";

const sendJson = vi.fn();
const refresh = vi.fn();
vi.mock("@kundenportal/web-auth/browser", () => ({
  sendJson: (...args: unknown[]) => sendJson(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => vi.clearAllMocks());

const texts = de.passes;

describe("invitation form", () => {
  it("sends address and test minutes and shows the link once with a copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    sendJson.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        link: "https://portal.example/pass/einloesen#abc",
        expiresAt: "2026-10-14T10:00:00Z",
      },
    });
    render(<InvitationForm texts={texts.invite} locale="de" />);
    fireEvent.change(screen.getByLabelText(texts.invite.email), {
      target: { value: "gast@example.org" },
    });
    fireEvent.change(screen.getByLabelText(texts.invite.minutes), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: texts.invite.submit }));
    await waitFor(() =>
      expect(screen.getByTestId("invitation-link").textContent).toBe(
        "https://portal.example/pass/einloesen#abc",
      ),
    );
    expect(sendJson).toHaveBeenCalledWith("POST", "/cockpit/api/invitations", {
      email: "gast@example.org",
      validMinutes: 3,
    });
    fireEvent.click(screen.getByRole("button", { name: texts.invite.copyLink }));
    await waitFor(() => expect(screen.getByText(texts.invite.copied)).toBeDefined());
    expect(writeText).toHaveBeenCalledWith("https://portal.example/pass/einloesen#abc");
  });

  it("explains a conflict", async () => {
    sendJson.mockResolvedValue({ ok: false, status: 409 });
    render(<InvitationForm texts={texts.invite} locale="de" />);
    fireEvent.change(screen.getByLabelText(texts.invite.email), {
      target: { value: "gast@example.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: texts.invite.submit }));
    await waitFor(() => expect(screen.getByText(texts.invite.conflict)).toBeDefined());
    expect(sendJson.mock.calls[0]?.[2]).toEqual({ email: "gast@example.org" });
  });
});

describe("revoke button", () => {
  it("is a danger icon button named after the holder and asks for a second click", async () => {
    sendJson.mockResolvedValue({ ok: true, status: 204 });
    render(<RevokeButton passId="pass-1" email="gast@example.org" texts={texts.revoke} />);
    const start = screen.getByRole("button", { name: "Pass von gast@example.org widerrufen …" });
    expect(start).toHaveAttribute("title", texts.revoke.start);
    // The live E2E finds it by "Widerrufen …" (Playwright matches a substring, any case).
    expect(start.getAttribute("aria-label")?.toLowerCase()).toContain(
      texts.revoke.start.toLowerCase(),
    );
    fireEvent.click(start);
    expect(sendJson).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: texts.revoke.confirm }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(texts.revoke.done));
    expect(sendJson).toHaveBeenCalledWith("POST", "/cockpit/api/passes/pass-1/revoke", {});
    expect(refresh).toHaveBeenCalled();
  });

  it("can be cancelled and reports a failure", async () => {
    sendJson.mockResolvedValue({ ok: false, status: 500 });
    render(<RevokeButton passId="pass-2" email="x@example.org" texts={texts.revoke} />);
    fireEvent.click(screen.getByRole("button", { name: /widerrufen/i }));
    fireEvent.click(screen.getByRole("button", { name: texts.revoke.cancel }));
    expect(screen.queryByRole("button", { name: texts.revoke.confirm })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /widerrufen/i }));
    fireEvent.click(screen.getByRole("button", { name: texts.revoke.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent(texts.revoke.failed);
  });
});
