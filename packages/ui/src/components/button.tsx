import type { ButtonHTMLAttributes } from "react";
import { type LinkComponent, type LinkProps, joinClasses } from "./link.js";

/**
 * - `primary`: the main action of a form or page.
 * - `secondary`: further actions next to it (cancel, back, filters).
 * - `ghost`: low-key actions without a frame, e.g. inside table rows.
 * - `danger`: starts a destructive action (outlined, e.g. "Kündigen").
 * - `danger-solid`: confirms a destructive action (filled, e.g. "Ja, widerrufen").
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";

/** `small` for dense places such as table rows, card headers and confirm steps. */
export type ButtonSize = "default" | "small";

interface ButtonLook {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
}

/**
 * A square button that shows only an icon. It has no visible text, so it needs an
 * `aria-label` as its accessible name (a `title` alone is not enough for every reader).
 */
type IconOnly = { icon: true; "aria-label": string } | { icon?: false | undefined };

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  primary: undefined,
  secondary: "kp-button-secondary",
  ghost: "kp-button-ghost",
  danger: "kp-button-danger",
  "danger-solid": "kp-button-danger-solid",
};

function buttonClass(
  { variant = "primary", size = "default" }: ButtonLook,
  icon: boolean | undefined,
  className: string | undefined,
): string {
  return joinClasses(
    "kp-button",
    VARIANT_CLASS[variant],
    size === "small" && "kp-button-small",
    icon && "kp-button-icon",
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonLook & IconOnly;

/** A real <button> for forms and actions; its visible text is its accessible name. */
export function Button({ variant, size, icon, type = "button", className, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass({ variant, size }, icon, className)} {...rest} />
  );
}

export type ButtonLinkProps = LinkProps &
  ButtonLook &
  IconOnly & {
    linkComponent?: LinkComponent;
  };

/** A link that looks like a button (navigation, GET-only actions such as sign-in). */
export function ButtonLink({
  variant,
  size,
  icon,
  className,
  linkComponent: Link = "a",
  ...rest
}: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size }, icon, className)} {...rest} />;
}
