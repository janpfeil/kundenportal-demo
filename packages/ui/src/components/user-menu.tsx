"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

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
 * address and holds account links and the sign-out. Menu-button pattern (WAI-ARIA):
 * Enter/Space/ArrowDown open it on the first entry, Escape closes it and returns focus,
 * a click outside closes it.
 */
export function UserMenu({ name, email, label, links = [], logout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const display = name?.trim() || email || label;

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const items = () => [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  const onMenuKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      all[(index + step + all.length) % all.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? all[0] : all[all.length - 1])?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="kp-user-menu" ref={root} data-testid="user-menu">
      <button
        ref={button}
        type="button"
        className="kp-user-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${label}: ${display}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
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
