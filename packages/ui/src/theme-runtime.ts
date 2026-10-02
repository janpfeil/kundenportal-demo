/**
 * Choosing a theme at runtime: the cookies that remember the choice, the attributes on
 * <html> that select it, the tiny init script that applies the cookies before the first paint
 * on prerendered pages, and the switcher's `applyTheme`. No React, no Next.js: usable in
 * server layouts, route handlers, client components and the init script alike.
 */
import {
  type Audience,
  type ColorMode,
  COLOR_MODES,
  DEFAULT_COLOR_MODE,
  DEFAULT_PRESET,
  type NavLayout,
  type NavMarker,
  PRESETS,
  THEME_PRESETS,
  type ThemePreset,
} from "./themes.js";

/**
 * Cookies holding the choice, shared by the shell and every zone (same domain, path `/`).
 * Not HttpOnly: the switcher writes them in the browser. Values are validated on every read.
 */
const PRESET_COOKIE_PREFIX = "kp_theme_";
export const THEME_COOKIES = {
  kunde: `${PRESET_COOKIE_PREFIX}kunde`,
  cockpit: `${PRESET_COOKIE_PREFIX}cockpit`,
  mode: "kp_color_mode",
} as const satisfies Record<Audience | "mode", string>;

/** One year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export interface ThemeChoice {
  preset: ThemePreset;
  mode: ColorMode;
}

export function isAudience(value: unknown): value is Audience {
  return value === "kunde" || value === "cockpit";
}

export function isColorMode(value: unknown): value is ColorMode {
  return (COLOR_MODES as readonly unknown[]).includes(value);
}

/** Whether `value` is a preset of this audience (a cockpit preset is no customer preset). */
export function isPresetOf(audience: Audience, value: unknown): value is ThemePreset {
  return (THEME_PRESETS[audience] as readonly unknown[]).includes(value);
}

/** The visitor's choice from the cookies; anything missing or unknown falls back to the default. */
export function readThemeChoice(
  audience: Audience,
  cookie: (name: string) => string | undefined,
): ThemeChoice {
  const preset = cookie(THEME_COOKIES[audience]);
  const mode = cookie(THEME_COOKIES.mode);
  return {
    preset: isPresetOf(audience, preset) ? preset : DEFAULT_PRESET[audience],
    mode: isColorMode(mode) ? mode : DEFAULT_COLOR_MODE,
  };
}

/** Cookie values from a `Cookie` request header or `document.cookie`. */
export function parseCookies(header: string | null | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name || cookies.has(name)) continue;
    try {
      cookies.set(name, decodeURIComponent(part.slice(index + 1).trim()));
    } catch {
      // A malformed value counts as missing.
    }
  }
  return cookies;
}

export interface ThemeAttributes {
  "data-audience": Audience;
  "data-theme-preset": ThemePreset;
  "data-color-mode": ColorMode;
  /** Derived from the preset; the layout CSS keys on it. */
  "data-nav": NavLayout;
  "data-nav-marker": NavMarker;
}

/** Attributes for <html>; spread them onto the root layout's element. */
export function themeAttributes(
  audience: Audience,
  choice: Partial<ThemeChoice> = {},
): ThemeAttributes {
  const preset = isPresetOf(audience, choice.preset) ? choice.preset : DEFAULT_PRESET[audience];
  return {
    "data-audience": audience,
    "data-theme-preset": preset,
    "data-color-mode": isColorMode(choice.mode) ? choice.mode : DEFAULT_COLOR_MODE,
    "data-nav": PRESETS[preset].nav,
    "data-nav-marker": PRESETS[preset].marker,
  };
}

/** A `Set-Cookie`/`document.cookie` string for one theme cookie. */
export function themeCookie(name: string, value: string, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The theme the page shows now, read from <html> (browser only). */
export function currentTheme(root: HTMLElement = document.documentElement): {
  audience: Audience;
} & ThemeChoice {
  const audience = isAudience(root.dataset["audience"]) ? root.dataset["audience"] : "kunde";
  return {
    audience,
    ...readThemeChoice(audience, (name) =>
      name === THEME_COOKIES[audience]
        ? root.dataset["themePreset"]
        : name === THEME_COOKIES.mode
          ? root.dataset["colorMode"]
          : undefined,
    ),
  };
}

/**
 * Applies a choice immediately (attributes on <html>) and remembers it in the cookies, so the
 * shell and every zone render it from the next request on. Invalid values are ignored.
 */
export function applyTheme(
  change: Partial<ThemeChoice>,
  root: HTMLElement = document.documentElement,
): ThemeChoice {
  const now = currentTheme(root);
  const next: ThemeChoice = {
    preset: isPresetOf(now.audience, change.preset) ? change.preset : now.preset,
    mode: isColorMode(change.mode) ? change.mode : now.mode,
  };
  for (const [name, value] of Object.entries(themeAttributes(now.audience, next)))
    root.setAttribute(name, value);
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  if (change.preset !== undefined && next.preset === change.preset)
    document.cookie = themeCookie(THEME_COOKIES[now.audience], next.preset, secure);
  if (change.mode !== undefined && next.mode === change.mode)
    document.cookie = themeCookie(THEME_COOKIES.mode, next.mode, secure);
  return next;
}

/** Path of the init script on the portal's domain (served by the shell for every zone). */
export const THEME_INIT_PATH = "/theme-init.js";

/**
 * Source of `/theme-init.js`: loaded synchronously in <head> of prerendered pages, it applies
 * the cookies before the first paint. The page states its audience (`data-audience`); the
 * script only reads cookies and sets validated attributes, so it holds nothing secret and is
 * the same for every visitor (cacheable). An external file, not inline: the CSP allows it via
 * `'self'` without a hash.
 */
export function themeInitScript(): string {
  const presets: Record<string, Record<string, [NavLayout, NavMarker]>> = {};
  for (const audience of ["kunde", "cockpit"] as const) {
    presets[audience] = {};
    for (const preset of THEME_PRESETS[audience])
      presets[audience][preset] = [PRESETS[preset].nav, PRESETS[preset].marker];
  }
  return `/* Applies the theme cookies before the first paint; generated from @kundenportal/ui. */
(function () {
  try {
    var root = document.documentElement;
    var audience = root.getAttribute("data-audience") === "cockpit" ? "cockpit" : "kunde";
    var presets = ${JSON.stringify(presets)}[audience];
    var modes = ${JSON.stringify(COLOR_MODES)};
    var cookies = Object.create(null);
    document.cookie.split(";").forEach(function (part) {
      var i = part.indexOf("=");
      var name = part.slice(0, i).trim();
      if (i > 0 && !(name in cookies)) {
        try { cookies[name] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) {}
      }
    });
    var preset = cookies[${JSON.stringify(PRESET_COOKIE_PREFIX)} + audience];
    if (preset && Object.prototype.hasOwnProperty.call(presets, preset)) {
      root.setAttribute("data-theme-preset", preset);
      root.setAttribute("data-nav", presets[preset][0]);
      root.setAttribute("data-nav-marker", presets[preset][1]);
    }
    var mode = cookies[${JSON.stringify(THEME_COOKIES.mode)}];
    if (modes.indexOf(mode) >= 0) root.setAttribute("data-color-mode", mode);
  } catch (e) {}
})();
`;
}

/**
 * Icons and manifest of the portal (served by the shell for every zone, see
 * `apps/shell/src/app/manifest.ts`): the brand mark in the default customer preset. Zones
 * with their own base path spread this into their Next.js metadata.
 */
export const APP_ICONS: {
  icons: { icon: { url: string; sizes?: string; type?: string }[]; apple: string };
  manifest: string;
} = {
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.webmanifest",
};
