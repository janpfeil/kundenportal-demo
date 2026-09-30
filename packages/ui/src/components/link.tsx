import type { AnchorHTMLAttributes, ComponentType } from "react";

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/**
 * Element used for links inside the library. Defaults to a plain <a> (a full page load, which
 * is what crossing into another zone needs); a zone may pass its framework link (e.g. a
 * wrapper around next/link) for client-side navigation within itself.
 */
export type LinkComponent = "a" | ComponentType<LinkProps>;

export function joinClasses(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
