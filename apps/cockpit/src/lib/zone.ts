import type { NavItem } from "@kundenportal/ui";
import type { CommonTexts } from "@kundenportal/ui/i18n";

/** URL prefix of this zone; must equal `basePath` in next.config.ts and the CDK zone registry. */
export const BASE_PATH: string = "/cockpit";

/** Absolute path of a page or route handler of this zone (what the browser requests). */
export function zonePath(path = ""): string {
  return `${BASE_PATH}${path}`;
}

/**
 * Main navigation, identical to the shell's: shell pages and zones are separate apps, so
 * the entries are absolute paths on the portal's domain. This zone's entry is marked active.
 */
export function navigation(t: CommonTexts, signedIn: boolean, cockpitLabel = "Cockpit"): NavItem[] {
  return [
    { href: "/", label: t.nav.home },
    ...(signedIn
      ? [
          { href: "/konto", label: t.nav.account },
          { href: "/postfach", label: t.nav.mailbox },
          { href: "/vertraege", label: t.nav.contracts, active: BASE_PATH === "/vertraege" },
          { href: "/verbrauch", label: t.nav.consumption, active: BASE_PATH === "/verbrauch" },
          { href: "/cockpit", label: cockpitLabel, active: BASE_PATH === "/cockpit" },
        ]
      : []),
  ];
}

/** Replaces `{name}` placeholders in a translated text. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
