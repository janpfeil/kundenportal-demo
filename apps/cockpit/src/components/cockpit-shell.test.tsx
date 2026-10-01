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
    expect(within(side).getByText("Migration")).toBeDefined();
    expect(within(side).getByText("Verwaltung")).toBeDefined();
    expect(within(side).getByRole("link", { name: /Klärfälle 14 offen/ })).toHaveAttribute(
      "href",
      "/cockpit#klaerfaelle",
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

  it("follows the shortcuts g c and g p", () => {
    render(shell());
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "p" });
    expect(assign).toHaveBeenCalledWith("/cockpit/paesse");
  });
});
