import { type NavItem, type Shortcut, portalNavigation } from "@kundenportal/ui";
import type { CommonTexts } from "@kundenportal/ui/i18n";
import { rolesOf } from "@kundenportal/web-auth";

/** URL prefix of this zone; must equal `basePath` in next.config.ts and the CDK zone registry. */
export const BASE_PATH: string = "/cockpit";

/** Absolute path of a page or route handler of this zone (what the browser requests). */
export function zonePath(path = ""): string {
  return `${BASE_PATH}${path}`;
}

/** Path of the search results; the search forms send `?q=` there (GET, a full page load). */
export const SEARCH_PATH = zonePath("/suche");

/**
 * Main navigation, identical to the shell's; the cockpit entry (owner and pass holders) is
 * marked as the current section. Used for visitors without cockpit access.
 */
export function navigation(t: CommonTexts, session?: { accessToken: string }): NavItem[] {
  return portalNavigation(t, {
    signedIn: Boolean(session),
    current: BASE_PATH,
    roles: rolesOf(session?.accessToken),
  });
}

/** A navigation entry with the zone pages (paths below the basePath) it marks as current. */
export interface ZoneNavItem extends NavItem {
  currentOn?: readonly string[] | undefined;
}

export interface CockpitNavTexts {
  groups: { migration: string; admin: string; portal: string };
  overview: string;
  clarifications: string;
  deadLetters: string;
  events: string;
  passes: string;
  settings: string;
  passStatus: string;
  toPortal: string;
}

export interface CockpitCounts {
  clarifications?: number | undefined;
  deadLetters?: number | undefined;
}

/**
 * The cockpit's own navigation as in the mockup: "Migration" (overview and its sections
 * with open counts) for owner and pass holders, "Verwaltung" (demo passes and their
 * settings) for the owner only. Pass holders get their pass status instead. Both find the
 * way back to the customer area ("Kundenportal") at the end.
 */
export function cockpitNavigation(
  texts: CockpitNavTexts,
  access: "owner" | "pass",
  counts: CockpitCounts,
): ZoneNavItem[] {
  const migration: ZoneNavItem[] = [
    {
      href: zonePath(),
      label: texts.overview,
      icon: "gauge",
      kbd: "g c",
      group: texts.groups.migration,
      currentOn: ["/"],
    },
    {
      href: zonePath("#klaerfaelle"),
      label: texts.clarifications,
      icon: "alert",
      count: counts.clarifications,
      sub: true,
    },
    {
      href: zonePath("#dlq"),
      label: texts.deadLetters,
      icon: "inbox",
      count: counts.deadLetters,
      sub: true,
    },
    { href: zonePath("#ereignisse"), label: texts.events, icon: "clock", sub: true },
  ];
  const portal: ZoneNavItem = {
    href: "/konto",
    label: texts.toPortal,
    icon: "home",
    group: texts.groups.portal,
  };
  if (access === "pass") {
    return [...migration, portal, { href: "/pass", label: texts.passStatus, icon: "ticket" }];
  }
  return [
    ...migration,
    {
      href: zonePath("/paesse"),
      label: texts.passes,
      icon: "ticket",
      kbd: "g p",
      group: texts.groups.admin,
      currentOn: ["/paesse"],
    },
    {
      href: zonePath("/paesse#einstellungen"),
      label: texts.settings,
      icon: "settings",
      sub: true,
    },
    portal,
  ];
}

/** Key sequences of the sidebar's hints: "g c" overview, "g p" passes (owner only). */
export function cockpitShortcuts(access: "owner" | "pass"): Shortcut[] {
  return [
    { keys: "g c", href: zonePath() },
    ...(access === "owner" ? [{ keys: "g p", href: zonePath("/paesse") }] : []),
  ];
}

/**
 * Marks the entries whose `currentOn` holds the current page. `pathname` may carry the
 * basePath or not (Next's usePathname leaves it out).
 */
export function markCurrent(items: readonly ZoneNavItem[], pathname: string): NavItem[] {
  const inner =
    pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`)
      ? pathname.slice(BASE_PATH.length)
      : pathname;
  const path = inner.replace(/\/+$/, "") || "/";
  return items.map(({ currentOn, ...item }) =>
    currentOn ? { ...item, active: currentOn.includes(path) } : item,
  );
}
