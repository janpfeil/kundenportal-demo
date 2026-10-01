import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { commonTexts } from "../i18n/index.js";
import { themeAttributes } from "../theme-runtime.js";
import { AppearanceMenu } from "./appearance-menu.js";
import { UserMenu, initialsOf } from "./user-menu.js";

function resetDocument(audience: "kunde" | "cockpit") {
  const root = document.documentElement;
  for (const name of [...root.getAttributeNames()]) root.removeAttribute(name);
  for (const [name, value] of Object.entries(themeAttributes(audience)))
    root.setAttribute(name, value);
  for (const name of ["kp_theme_kunde", "kp_theme_cockpit", "kp_color_mode"])
    document.cookie = `${name}=; Path=/; Max-Age=0`;
}

afterEach(() => resetDocument("kunde"));

const menu = (name?: string) => (
  <UserMenu
    name={name}
    email="anna.becker@example.org"
    label="Benutzermenü"
    links={[{ href: "/konto", label: "Mein Konto" }]}
    logout={{ href: "/auth/logout", label: "Abmelden" }}
  />
);

describe("UserMenu", () => {
  it("builds initials from the name, else from the address", () => {
    expect(initialsOf("Anna Becker", "x@y")).toBe("AB");
    expect(initialsOf("Bernd Ali Yilmaz", undefined)).toBe("BY");
    expect(initialsOf("carla", undefined)).toBe("C");
    expect(initialsOf(undefined, "emil@example.org")).toBe("E");
    expect(initialsOf("  ", undefined)).toBe("?");
  });

  it("shows who is signed in and keeps the sign-out in the menu", () => {
    render(menu("Anna Becker"));
    const button = screen.getByRole("button", { name: "Benutzermenü: Anna Becker" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toHaveTextContent("anna.becker@example.org");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Mein Konto",
      "Abmelden",
    ]);
    // Focus moves into the menu; arrow keys move on, Escape closes and returns focus.
    expect(document.activeElement).toHaveTextContent("Mein Konto");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toHaveTextContent("Abmelden");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("falls back to the address and closes on a click outside", () => {
    render(
      <div>
        <p>draußen</p>
        {menu()}
      </div>,
    );
    const button = screen.getByRole("button", { name: "Benutzermenü: anna.becker@example.org" });
    fireEvent.click(button);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.mouseDown(screen.getByText("draußen"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("appearance in the user menu", () => {
  const withAppearance = (audience: "kunde" | "cockpit", locale: "de" | "en" = "de") => (
    <UserMenu
      name="Anna Becker"
      label={commonTexts[locale].auth.menu}
      logout={{ href: "/auth/logout", label: commonTexts[locale].auth.logout }}
      appearance={{ audience, texts: commonTexts[locale].appearance }}
    />
  );

  it("offers the customer presets and the colour mode as radio entries", () => {
    resetDocument("kunde");
    render(withAppearance("kunde"));
    fireEvent.click(screen.getByRole("button", { name: /Benutzermenü/ }));
    const styles = screen.getByRole("group", { name: "Darstellung: Stil" });
    const presets = [...styles.querySelectorAll('[role="menuitemradio"]')];
    expect(presets.map((item) => item.textContent)).toEqual([
      "Klar",
      "Vertrauen",
      "Warm",
      "Klassisch",
    ]);
    expect(presets.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    const modes = screen.getByRole("group", { name: "Darstellung: Farbmodus" });
    expect(modes).toHaveTextContent("HellDunkelSystem");
    expect(screen.getByRole("menuitemradio", { name: "System" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("applies a choice at once, remembers it and keeps the menu open", () => {
    resetDocument("kunde");
    render(withAppearance("kunde"));
    fireEvent.click(screen.getByRole("button", { name: /Benutzermenü/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Vertrauen" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Dunkel" }));
    const root = document.documentElement;
    expect(root).toHaveAttribute("data-theme-preset", "vertrauen");
    expect(root).toHaveAttribute("data-color-mode", "dark");
    expect(root).toHaveAttribute("data-nav", "top");
    expect(document.cookie).toContain("kp_theme_kunde=vertrauen");
    expect(document.cookie).toContain("kp_color_mode=dark");
    expect(screen.getByRole("menuitemradio", { name: "Vertrauen" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Klar" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("reaches the radio entries with the arrow keys", () => {
    resetDocument("cockpit");
    render(withAppearance("cockpit", "en"));
    fireEvent.click(screen.getByRole("button", { name: /User menu/ }));
    const menu = screen.getByRole("menu");
    // First entry is the first preset (no account links here).
    expect(document.activeElement).toHaveTextContent("Dense");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toHaveTextContent("Overview");
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toHaveTextContent("Sign out");
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toHaveTextContent("System");
  });
});

describe("AppearanceMenu (signed out)", () => {
  it("opens from its own button and switches the colour mode", () => {
    resetDocument("kunde");
    render(<AppearanceMenu audience="kunde" texts={commonTexts.de.appearance} />);
    const button = screen.getByRole("button", { name: "Darstellung" });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Hell" }));
    expect(document.documentElement).toHaveAttribute("data-color-mode", "light");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
