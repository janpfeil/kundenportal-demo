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
  /**
   * What the signed-in visitor may use beyond the common entries: the demo-pass status
   * (pass holders) and the cockpit (owner and pass holders). The same in every app.
   */
  roles?: { cockpit?: boolean; pass?: boolean };
  /** Entries after the common ones. */
  extra?: readonly Omit<NavItem, "active">[];
}

/**
 * Start page for everyone; mailbox, contracts and consumption once signed in (the account
 * is in the user menu), then
 * the caller's extra entries. The entry of the current section carries `active`.
 */
export function portalNavigation(
  t: CommonTexts,
  { signedIn, current, roles = {}, extra = [] }: PortalNavigationOptions,
): NavItem[] {
  const entries: Omit<NavItem, "active">[] = [
    { href: "/", label: t.nav.home, icon: "home" as const },
    ...(signedIn
      ? [
          // "Mein Konto" lives in the user menu next to the sign-out.
          { href: "/postfach", label: t.nav.mailbox, icon: "mail" as const },
          { href: "/vertraege", label: t.nav.contracts, icon: "file" as const },
          { href: "/verbrauch", label: t.nav.consumption, icon: "chart" as const },
          ...(roles.pass ? [{ href: "/pass", label: t.nav.pass, icon: "ticket" as const }] : []),
          ...(roles.cockpit
            ? [{ href: "/cockpit", label: t.nav.cockpit, icon: "gauge" as const }]
            : []),
          ...extra,
        ]
      : []),
  ];
  return entries.map((entry) =>
    isCurrentSection(entry.href, current) ? { ...entry, active: true } : { ...entry },
  );
}
