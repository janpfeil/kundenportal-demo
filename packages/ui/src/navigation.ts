/**
 * The portal's main navigation, the same in the shell and every zone. Shell pages and zones
 * are separate apps, so the entries are absolute paths on the portal's domain.
 */
import type { NavItem } from "./components/app-shell.js";
import type { CommonTexts } from "./i18n/index.js";

/**
 * Whether `href` is the section of `current` (a path without query): the start page only
 * for itself, every other entry for itself and everything below it.
 */
export function isCurrentSection(href: string, current: string | undefined): boolean {
  if (current === undefined) return false;
  const path = current.split(/[?#]/)[0] || "/";
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

export interface PortalNavigationOptions {
  signedIn: boolean;
  /** Path of the current page (or the zone's basePath); its section is marked. */
  current?: string;
  /** Entries after the common ones, e.g. the shell's demo pass or the cockpit. */
  extra?: readonly Omit<NavItem, "active">[];
}

/**
 * Start page for everyone; account, mailbox, contracts and consumption once signed in, then
 * the caller's extra entries. The entry of the current section carries `active`.
 */
export function portalNavigation(
  t: CommonTexts,
  { signedIn, current, extra = [] }: PortalNavigationOptions,
): NavItem[] {
  const entries: Omit<NavItem, "active">[] = [
    { href: "/", label: t.nav.home },
    ...(signedIn
      ? [
          { href: "/konto", label: t.nav.account },
          { href: "/postfach", label: t.nav.mailbox },
          { href: "/vertraege", label: t.nav.contracts },
          { href: "/verbrauch", label: t.nav.consumption },
          ...extra,
        ]
      : []),
  ];
  return entries.map((entry) =>
    isCurrentSection(entry.href, current) ? { ...entry, active: true } : { ...entry },
  );
}
