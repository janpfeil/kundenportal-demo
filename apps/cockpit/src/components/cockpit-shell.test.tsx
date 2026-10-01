// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import { cockpitNavigation, cockpitShortcuts } from "@/lib/zone";
import { CockpitShell } from "./cockpit-shell";

const location = { pathname: "/", search: "" };
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/cockpit${href}`} {...rest}>
      {children}
    </a>
  ),
}));

const assign = vi.fn();
beforeEach(() => {
  location.pathname = "/";
  location.search = "";
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function shell() {
  return (
    <CockpitShell
      brand={{ href: "/cockpit", label: "Kundenportal", suffix: "Cockpit" }}
      nav={cockpitNavigation({ ...de.frame, passStatus: "Demo-Pass" }, "owner", {
        clarifications: 14,
        deadLetters: 6,
      })}
      navLabel="Hauptnavigation"
      sideNavLabel={de.frame.sideNav}
      navTexts={{ openCount: "{count} offen", shortcut: "Tastenkürzel {keys}" }}
      search={{ label: de.frame.search, placeholder: de.frame.searchPlaceholder }}
      shortcuts={cockpitShortcuts("owner")}
    >
      <p>Inhalt</p>
    </CockpitShell>
  );
}

describe("cockpit frame", () => {
  it("shows the sidebar sections with counts and marks the current page", () => {
    location.pathname = "/paesse";
    render(shell());
    const side = screen.getByRole("navigation", { name: de.frame.sideNav });
    expect(within(side).getByText("Betrieb")).toBeDefined();
    expect(within(side).getAllByText("Migration").length).toBeGreaterThan(0);
    expect(within(side).getByText("Verwaltung")).toBeDefined();
    expect(within(side).getByRole("link", { name: /Klärfälle 14 offen/ })).toHaveAttribute(
      "href",
      "/cockpit/migration#klaerfaelle",
    );
    expect(within(side).getByRole("link", { name: /^Kunden Tastenkürzel g k/ })).toHaveAttribute(
      "href",
      "/cockpit/kunden",
    );
    expect(within(side).getByRole("link", { name: /Demo-Pässe/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(side).getByRole("link", { name: /Übersicht/ })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(side).getByRole("link", { name: /Übersicht Tastenkürzel g c/ })).toBeDefined();
  });

  it("searches with a GET form that keeps the query on the result page", () => {
    location.pathname = "/suche";
    location.search = "q=T%2F88";
    render(shell());
    const search = screen.getByRole("search", { name: de.frame.search });
    expect(search).toHaveAttribute("action", "/cockpit/suche");
    expect(within(search).getByRole("searchbox")).toHaveValue("T/88");
  });

  it("goes back to the top when 'Migration' points to the open page", () => {
    location.pathname = "/migration";
    const scrollTo = vi.fn();
    const pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => undefined);
    vi.stubGlobal("scrollTo", scrollTo);
    vi.stubGlobal("location", {
      ...window.location,
      href: "https://portal.example/cockpit/migration#klaerfaelle",
      pathname: "/cockpit/migration",
      search: "",
      hash: "#klaerfaelle",
      assign,
    });
    render(shell());
    const sidebar = screen.getByRole("navigation", { name: de.frame.sideNav });
    expect(within(sidebar).getByRole("link", { name: /^Migration/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const migration = within(sidebar).getByRole("link", { name: /^Migration/ });
    expect(fireEvent.click(migration)).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(pushState).toHaveBeenCalledWith(null, "", "/cockpit/migration");

    // A link to another page stays a normal navigation.
    scrollTo.mockClear();
    const passes = within(sidebar).getByRole("link", { name: /^Demo-Pässe/ });
    expect(fireEvent.click(passes)).toBe(true);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("follows the shortcuts of the sidebar", () => {
    render(shell());
    for (const [key, href] of [
      ["p", "/cockpit/paesse"],
      ["k", "/cockpit/kunden"],
      ["v", "/cockpit/vertraege"],
      ["t", "/cockpit/produkte"],
      ["m", "/cockpit/migration"],
      ["c", "/cockpit"],
    ] as const) {
      fireEvent.keyDown(document.body, { key: "g" });
      fireEvent.keyDown(document.body, { key });
      expect(assign).toHaveBeenLastCalledWith(href);
    }
  });
});
