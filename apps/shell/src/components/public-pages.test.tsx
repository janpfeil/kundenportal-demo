// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicDe } from "@/i18n/public-de";
import { RedeemPage } from "./redeem-page";
import { ShellFrame } from "./shell-frame";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
// The ALTCHA widget is a web component loaded in the browser; not needed here.
vi.mock("altcha", () => ({}));
vi.mock("altcha/i18n/de", () => ({}));
vi.mock("altcha/i18n/en", () => ({}));

const offer = {
  passDays: 5,
  quotas: { api: 4000, events: 900, uploads: 10 },
  uploadMaxBytes: 5 * 1024 * 1024,
  redemptionOpen: true,
};

function clearCookies() {
  for (const name of ["kp_locale", "kp_ui"])
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

beforeEach(() => {
  pathname = "/";
  clearCookies();
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearCookies();
});

const navLinks = () =>
  within(screen.getByRole("navigation"))
    .getAllByRole("link")
    .map((link) => link.textContent);

describe("ShellFrame", () => {
  it("marks the current section, also below it", () => {
    pathname = "/postfach";
    render(
      <ShellFrame state={{ locale: "de", signedIn: true, passHolder: false }}>
        <p>Inhalt</p>
      </ShellFrame>,
    );
    expect(screen.getByRole("link", { name: "Postfach" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Start" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Abmelden" })).toHaveAttribute("href", "/auth/logout");
  });

  it("on prerendered pages takes language and signed-in state from the browser's cookies", () => {
    document.cookie = "kp_locale=en; path=/";
    document.cookie = "kp_ui=pass; path=/";
    pathname = "/pass/einloesen";
    render(
      <ShellFrame>
        <p>Content</p>
      </ShellFrame>,
    );
    expect(navLinks()).toEqual([
      "Home",
      "My account",
      "Mailbox",
      "Contracts",
      "Consumption",
      "Demo pass",
    ]);
    expect(screen.getByRole("link", { name: "Demo pass" })).toHaveAttribute("aria-current", "page");
    expect(document.documentElement.lang).toBe("en");
  });

  it("shows only the start page and the sign-in without the hint", () => {
    document.cookie = "kp_locale=de; path=/";
    render(
      <ShellFrame>
        <p>Inhalt</p>
      </ShellFrame>,
    );
    expect(navLinks()).toEqual(["Start"]);
    expect(screen.getByRole("link", { name: "Anmelden" })).toHaveAttribute("href", "/auth/login");
  });
});

describe("RedeemPage", () => {
  // jsdom's browser prefers English; these checks read the German texts.
  beforeEach(() => {
    document.cookie = "kp_locale=de; path=/";
  });

  it("shows the current offer from the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(offer));
    vi.stubGlobal("fetch", fetchMock);
    window.location.hash = "#abcdefghijklmnopqrstuvwxyz012345";
    render(<RedeemPage />);
    const facts = screen.getByTestId("redeem-offer");
    expect(facts).toHaveTextContent(publicDe.redeem.about.loading);
    expect(await screen.findByText("5 Tage ab dem Einlösen")).toBeInTheDocument();
    expect(facts.textContent?.replace(/[\u00a0\u202f]/g, " ")).toContain(
      "4.000 API-Aufrufe, 900 Ereignisse, 10 Uploads mit je höchstens 5 MB",
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/tenancy/offer", expect.anything());
    expect(screen.getByTestId("redeem-form")).toBeInTheDocument();
  });

  it("explains a paused redemption instead of offering the form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ...offer, redemptionOpen: false })),
    );
    render(<RedeemPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Einlösen ist gerade pausiert");
    expect(screen.queryByTestId("redeem-form")).not.toBeInTheDocument();
  });

  it("keeps the form without numbers when the offer cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })));
    render(<RedeemPage />);
    expect(await screen.findAllByText(publicDe.redeem.about.unavailable)).toHaveLength(2);
    expect(screen.getByTestId("redeem-offer")).toHaveAttribute("data-state", "failed");
  });
});
