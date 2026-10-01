"use client";

import { type ButtonHTMLAttributes, type ReactNode, useState } from "react";
import { joinClasses } from "./link.js";

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "role" | "onChange" | "value" | "defaultChecked" | "name" | "children"
> {
  /** Controlled state; leave out and use `defaultChecked` for a self-managed switch. */
  checked?: boolean | undefined;
  defaultChecked?: boolean | undefined;
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  /** Visible label, e.g. "Einlösen"; part of the accessible name. */
  children: ReactNode;
  /** Shown after the label, e.g. a StatusBadge "offen" / "gesperrt". */
  status?: ReactNode;
  /** With a name, a hidden field carries "true" or "false" when the form is sent. */
  name?: string | undefined;
}

/** An on/off setting (`role="switch"`, `aria-checked`) for settings pages. */
export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  children,
  status,
  name,
  className,
  onClick,
  type = "button",
  ...rest
}: SwitchProps) {
  const [own, setOwn] = useState(defaultChecked);
  const on = checked ?? own;
  return (
    <>
      <button
        type={type}
        role="switch"
        aria-checked={on}
        className={joinClasses("kp-switch", className)}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          if (checked === undefined) setOwn(!on);
          onCheckedChange?.(!on);
        }}
        {...rest}
      >
        <span className="kp-switch-track" aria-hidden="true" />
        <span>{children}</span>
        {status}
      </button>
      {name !== undefined && <input type="hidden" name={name} value={String(on)} />}
    </>
  );
}
