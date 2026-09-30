import { type NavItem, portalNavigation } from "@kundenportal/ui";
import type { CommonTexts } from "@kundenportal/ui/i18n";

/** URL prefix of this zone; must equal `basePath` in next.config.ts and the CDK zone registry. */
export const BASE_PATH: string = "/cockpit";

/** Absolute path of a page or route handler of this zone (what the browser requests). */
export function zonePath(path = ""): string {
  return `${BASE_PATH}${path}`;
}

/**
 * Main navigation, identical to the shell's plus the cockpit itself, which is marked as the
 * current section.
 */
export function navigation(t: CommonTexts, signedIn: boolean, cockpitLabel = "Cockpit"): NavItem[] {
  return portalNavigation(t, {
    signedIn,
    current: BASE_PATH,
    extra: [{ href: "/cockpit", label: cockpitLabel }],
  });
}
