"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

const ITEMS = '[role="menuitem"], [role="menuitemradio"]';

/**
 * Menu-button pattern (WAI-ARIA APG) shared by the user menu and the appearance menu:
 * Enter/Space/ArrowDown open the menu on its first entry, arrow keys, Home and End move
 * between entries, Escape closes it and returns focus to the button, Tab and a click outside
 * close it.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    root.current?.querySelector<HTMLElement>(ITEMS)?.focus();
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const onMenuKey = (event: KeyboardEvent<HTMLElement>) => {
    const all = [...(root.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
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

  const buttonProps = {
    ref: button,
    type: "button" as const,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": menuId,
    onClick: () => setOpen((value) => !value),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown" && !open) {
        event.preventDefault();
        setOpen(true);
      }
    },
  };

  return { open, root, menuId, onMenuKey, buttonProps };
}
