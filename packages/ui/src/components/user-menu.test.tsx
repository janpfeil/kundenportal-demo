import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserMenu, initialsOf } from "./user-menu.js";

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
