"use client";

import { AppearanceItems, type AppearanceSettings } from "./appearance-menu.js";
import { useMenu } from "./use-menu.js";

export interface MenuLink {
  href: string;
  label: string;
}

export interface UserMenuProps {
  /** Display name; falls back to the e-mail address. */
  name?: string | undefined;
  email?: string | undefined;
  /** Accessible name of the button, e.g. "Benutzermenü". */
  label: string;
  /** Entries above the sign-out, e.g. account and pass status. */
  links?: readonly MenuLink[];
  /** Sign-out: a plain GET link (the shell accepts no form posts). */
  logout: MenuLink;
  /** Adds the "Darstellung" section (theme preset and colour mode) above the sign-out. */
  appearance?: AppearanceSettings | undefined;
}

/** Up to two initials from the name ("Anna Becker" → "AB"), else the address's first letter. */
export function initialsOf(name: string | undefined, email: string | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const first = words[0]?.[0] ?? "";
    const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
    return (first + last).toUpperCase();
  }
  return (email?.trim()[0] ?? "?").toUpperCase();
}

/**
 * Signed-in user in the top bar: avatar with initials and name; the menu shows name and
 * address and holds account links, the appearance switch and the sign-out. Menu-button
 * pattern (WAI-ARIA, see useMenu).
 */
export function UserMenu({ name, email, label, links = [], logout, appearance }: UserMenuProps) {
  const { open, root, menuId, onMenuKey, buttonProps } = useMenu();
  const display = name?.trim() || email || label;

  return (
    <div className="kp-user-menu" ref={root} data-testid="user-menu">
      <button {...buttonProps} className="kp-user-button" aria-label={`${label}: ${display}`}>
        <span className="kp-avatar" aria-hidden="true">
          {initialsOf(name, email)}
        </span>
        <span className="kp-user-name">{display}</span>
        <span className="kp-user-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul id={menuId} role="menu" className="kp-user-popup" onKeyDown={onMenuKey}>
          <li role="presentation" className="kp-user-head">
            <span className="kp-user-head-name">{name?.trim() || "—"}</span>
            {email && <span className="kp-user-head-email">{email}</span>}
          </li>
          {links.map((link) => (
            <li role="presentation" key={link.href}>
              <a role="menuitem" href={link.href} tabIndex={-1}>
                {link.label}
              </a>
            </li>
          ))}
          {appearance && (
            <>
              <li role="separator" className="kp-user-separator" />
              <AppearanceItems {...appearance} />
            </>
          )}
          <li role="separator" className="kp-user-separator" />
          <li role="presentation">
            <a
              role="menuitem"
              href={logout.href}
              tabIndex={-1}
              className="kp-user-logout"
              data-testid="logout"
            >
              {logout.label}
            </a>
          </li>
        </ul>
      )}
    </div>
  );
}
