import type { ButtonHTMLAttributes } from "react";
import { type LinkComponent, type LinkProps, joinClasses } from "./link.js";

export type ButtonVariant = "primary" | "secondary";

function buttonClass(variant: ButtonVariant, className: string | undefined): string {
  return joinClasses("kp-button", variant === "secondary" && "kp-button-secondary", className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** A real <button> for forms and actions; its visible text is its accessible name. */
export function Button({ variant = "primary", type = "button", className, ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  linkComponent?: LinkComponent;
}

/** A link that looks like a button (navigation, GET-only actions such as sign-in). */
export function ButtonLink({
  variant = "primary",
  className,
  linkComponent: Link = "a",
  ...rest
}: ButtonLinkProps) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}
