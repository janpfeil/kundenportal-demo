/**
 * Themes of the portal: the presets the owner chose from the design mockup
 * (docs/design/mockups.html, phase 5) and the design tokens (`--kp-*`) computed from them.
 *
 * This file is the single source of truth: the UI build writes `dist/styles.css` from
 * `themesCss()` plus the hand-written component styles, the theme init script and the
 * switcher read the allowed values from here, and a unit test checks the WCAG contrast of
 * every preset in light and dark mode.
 *
 * A page selects a theme with attributes on <html> (see theme-runtime.ts):
 * `data-audience="kunde|cockpit"`, `data-theme-preset="…"`, `data-color-mode="light|dark|system"`.
 */
import { contrastRatio, fitContrast, mix } from "./color.js";

export type Audience = "kunde" | "cockpit";
export const AUDIENCES: readonly Audience[] = ["kunde", "cockpit"];

export type ColorMode = "light" | "dark" | "system";
export const COLOR_MODES: readonly ColorMode[] = ["light", "dark", "system"];

export type CustomerPreset = "klar" | "vertrauen" | "warm" | "klassisch";
export type CockpitPreset = "dicht" | "uebersicht" | "kontrast";
export type ThemePreset = CustomerPreset | CockpitPreset;

/** Presets per audience, in the order the switcher lists them; the first is the default. */
export const THEME_PRESETS = {
  kunde: ["klar", "vertrauen", "warm", "klassisch"],
  cockpit: ["dicht", "uebersicht", "kontrast"],
} as const satisfies Record<Audience, readonly ThemePreset[]>;

/** The owner's decision: customers "Klar", cockpit "Dicht"; the colour mode follows the system. */
export const DEFAULT_PRESET = { kunde: "klar", cockpit: "dicht" } as const satisfies Record<
  Audience,
  ThemePreset
>;
export const DEFAULT_COLOR_MODE: ColorMode = "system";

/** Where the main navigation sits: in the top bar, in a left sidebar, at the bottom on phones. */
export type NavLayout = "top" | "side" | "bottom";
/** How the current section is marked: tinted area, underline, or filled with the accent. */
export type NavMarker = "pill" | "underline" | "solid";

type Neutral = "cool" | "neutral" | "warm";
type FontKind = "sans" | "humanist" | "serif" | "rounded";
type Density = "compact" | "normal" | "airy";
type Shadow = "none" | "soft";

export interface PresetParams {
  audience: Audience;
  accent: string;
  neutral: Neutral;
  font: FontKind;
  /** Base font size in px. */
  size: number;
  lineHeight: number;
  /** Ratio of the type scale. */
  scale: number;
  density: Density;
  /** Corner radius in px. */
  radius: number;
  shadow: Shadow;
  /** Cards with a border line (else only the shadow sets them off). */
  border: boolean;
  nav: NavLayout;
  marker: NavMarker;
}

/** Parameters as in the mockup's PRESETS (accent, neutral tone, font, size, …). */
export const PRESETS: Record<ThemePreset, PresetParams> = {
  klar: {
    audience: "kunde",
    accent: "#0b6e4f",
    neutral: "neutral",
    font: "humanist",
    size: 16,
    lineHeight: 1.5,
    scale: 1.25,
    density: "normal",
    radius: 2,
    shadow: "none",
    border: true,
    nav: "top",
    marker: "underline",
  },
  vertrauen: {
    audience: "kunde",
    accent: "#1f5fae",
    neutral: "cool",
    font: "sans",
    size: 16,
    lineHeight: 1.55,
    scale: 1.2,
    density: "normal",
    radius: 8,
    shadow: "soft",
    border: true,
    nav: "top",
    marker: "pill",
  },
  warm: {
    audience: "kunde",
    accent: "#b5461b",
    neutral: "warm",
    font: "rounded",
    size: 17,
    lineHeight: 1.6,
    scale: 1.2,
    density: "airy",
    radius: 16,
    shadow: "soft",
    border: false,
    nav: "bottom",
    marker: "pill",
  },
  klassisch: {
    audience: "kunde",
    accent: "#0e5a63",
    neutral: "warm",
    font: "serif",
    size: 17,
    lineHeight: 1.6,
    scale: 1.25,
    density: "normal",
    radius: 6,
    shadow: "soft",
    border: true,
    nav: "side",
    marker: "solid",
  },
  dicht: {
    audience: "cockpit",
    accent: "#3451b2",
    neutral: "cool",
    font: "sans",
    size: 14,
    lineHeight: 1.4,
    scale: 1.125,
    density: "compact",
    radius: 4,
    shadow: "none",
    border: true,
    nav: "side",
    marker: "pill",
  },
  uebersicht: {
    audience: "cockpit",
    accent: "#0b6e4f",
    neutral: "neutral",
    font: "sans",
    size: 15,
    lineHeight: 1.5,
    scale: 1.2,
    density: "normal",
    radius: 12,
    shadow: "soft",
    border: false,
    nav: "top",
    marker: "underline",
  },
  kontrast: {
    audience: "cockpit",
    accent: "#0e7490",
    neutral: "neutral",
    font: "sans",
    size: 14,
    lineHeight: 1.45,
    scale: 1.15,
    density: "compact",
    radius: 6,
    shadow: "none",
    border: true,
    nav: "side",
    marker: "solid",
  },
};

interface NeutralSet {
  bg: string;
  surface: string;
  s2: string;
  border: string;
  strong: string;
  text: string;
  muted: string;
}

const NEUTRALS: Record<Neutral, Record<"light" | "dark", NeutralSet>> = {
  cool: {
    light: {
      bg: "#f4f6f9",
      surface: "#ffffff",
      s2: "#eef1f5",
      border: "#dce2ea",
      strong: "#b9c2ce",
      text: "#17202b",
      muted: "#535e6c",
    },
    dark: {
      bg: "#0e1318",
      surface: "#161c23",
      s2: "#1e252e",
      border: "#2a333e",
      strong: "#3d4856",
      text: "#e5eaf0",
      muted: "#9ba6b4",
    },
  },
  neutral: {
    light: {
      bg: "#f5f5f5",
      surface: "#ffffff",
      s2: "#f0f0f0",
      border: "#e0e0e0",
      strong: "#c0c0c0",
      text: "#1a1a1a",
      muted: "#595959",
    },
    dark: {
      bg: "#111111",
      surface: "#1a1a1a",
      s2: "#232323",
      border: "#303030",
      strong: "#474747",
      text: "#ececec",
      muted: "#a3a3a3",
    },
  },
  warm: {
    light: {
      bg: "#f8f4ee",
      surface: "#fffdfa",
      s2: "#f3ede4",
      border: "#e6dccd",
      strong: "#cbbda8",
      text: "#2a2119",
      muted: "#67594a",
    },
    dark: {
      bg: "#15120e",
      surface: "#1e1a15",
      s2: "#28231c",
      border: "#38312a",
      strong: "#51483d",
      text: "#efe7dc",
      muted: "#b2a592",
    },
  },
};

/** Status colours (background, border/icon, text) and the counter badge; the same in every preset. */
const STATUS = {
  light: {
    info: ["#e8f0fb", "#2f64b1", "#24508f"],
    success: ["#e6f4ed", "#0b6e4f", "#0a5c42"],
    warning: ["#fdf2df", "#9a5b00", "#7d4a00"],
    error: ["#fbeaea", "#b3261e", "#9c1f18"],
    badge: "#c62828",
  },
  dark: {
    info: ["#172435", "#7aa7ea", "#9cbdf0"],
    success: ["#14302a", "#3ccf9a", "#6fdcb4"],
    warning: ["#352a14", "#f0b94d", "#f4c870"],
    error: ["#3a1c1c", "#f28b82", "#f6a59e"],
    badge: "#e5484d",
  },
} as const;

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
const FONTS: Record<FontKind, { body: string; heading: string; weight: number; tracking: string }> =
  {
    sans: { body: SANS, heading: SANS, weight: 650, tracking: "-0.01em" },
    humanist: {
      body: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif',
      heading:
        'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif',
      weight: 600,
      tracking: "0",
    },
    serif: {
      body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      heading:
        '"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, "Book Antiqua", Georgia, serif',
      weight: 600,
      tracking: "0",
    },
    rounded: {
      body: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Calibri, source-sans-pro, sans-serif',
      heading:
        'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Calibri, source-sans-pro, sans-serif',
      weight: 700,
      tracking: "0",
    },
  };

/** Base spacing, height of controls (buttons, inputs, nav entries) and table cell padding, px. */
const DENSITY: Record<Density, { space: number; control: number; cell: number }> = {
  compact: { space: 10, control: 34, cell: 6 },
  normal: { space: 16, control: 44, cell: 11 },
  airy: { space: 22, control: 52, cell: 15 },
};

const SHADOWS = {
  light: {
    none: "none",
    soft: "0 1px 2px rgb(16 24 40 / 5%), 0 1px 3px rgb(16 24 40 / 8%)",
    raised: "0 12px 32px -8px rgb(16 24 40 / 24%), 0 2px 6px rgb(16 24 40 / 8%)",
  },
  dark: {
    none: "none",
    soft: "0 1px 2px rgb(0 0 0 / 40%), 0 1px 3px rgb(0 0 0 / 30%)",
    raised: "0 16px 40px -8px rgb(0 0 0 / 70%), 0 0 0 1px rgb(255 255 255 / 4%)",
  },
} as const;

export type Tokens = Record<`--kp-${string}`, string>;

const px = (value: number) => `${Math.round(value * 10) / 10}px`;

/** Tokens that depend on light or dark: colours, shadows, card border. */
export function colorTokens(preset: ThemePreset, dark: boolean): Tokens {
  const p = PRESETS[preset];
  const n = NEUTRALS[p.neutral][dark ? "dark" : "light"];
  const s = STATUS[dark ? "dark" : "light"];
  // In dark mode the accent is lightened until it reaches 4.5:1 on the surface.
  const accent = dark ? fitContrast(p.accent, n.surface, 4.5, 1) : p.accent;
  const onDark = dark ? n.bg : "#0b0f14";
  const accentContrast =
    contrastRatio(accent, "#ffffff") >= contrastRatio(accent, onDark) ? "#ffffff" : onDark;
  // Links and the current nav entry: 4.5:1 on the tinted accent area (the hardest
  // background); the mockup fitted against the surface only, which missed the dark nav entry.
  const accentSoft = mix(n.surface, accent, dark ? 0.2 : 0.1);
  const accentText = dark
    ? fitContrast(accent, accentSoft, 4.5, 1)
    : fitContrast(p.accent, accentSoft, 4.5, -1);
  // "Kontrast" style: stronger lines in the dark cockpit for scanability.
  const border =
    p.audience === "cockpit" && dark && p.border ? mix(n.border, n.text, 0.06) : n.border;
  const tokens: Tokens = {
    "--kp-bg": n.bg,
    "--kp-surface": n.surface,
    "--kp-surface-2": n.s2,
    "--kp-text": n.text,
    "--kp-muted": n.muted,
    "--kp-border": border,
    "--kp-border-strong": n.strong,
    "--kp-accent": accent,
    "--kp-accent-contrast": accentContrast,
    "--kp-accent-text": accentText,
    "--kp-accent-soft": accentSoft,
    "--kp-unread": mix(n.surface, accent, dark ? 0.12 : 0.06),
    "--kp-focus": accentText,
    "--kp-track": mix(n.s2, n.text, dark ? 0.08 : 0.06),
    "--kp-badge": s.badge,
    "--kp-row-hover": mix(n.surface, accent, dark ? 0.08 : 0.04),
    "--kp-input-bg": dark ? n.bg : n.surface,
    "--kp-header-bg": n.surface,
    "--kp-side-bg": dark ? n.bg : n.surface,
    "--kp-shadow": SHADOWS[dark ? "dark" : "light"][p.shadow],
    "--kp-shadow-raised": SHADOWS[dark ? "dark" : "light"].raised,
    "--kp-card-border": `1px solid ${p.border ? border : "transparent"}`,
  };
  return tokens;
}

/** Status tokens (info, success, warning, error: -bg, -border, -text); the same in every preset. */
export function statusTokens(dark: boolean): Tokens {
  const s = STATUS[dark ? "dark" : "light"];
  const tokens: Tokens = {};
  for (const kind of ["info", "success", "warning", "error"] as const) {
    tokens[`--kp-${kind}-bg`] = s[kind][0];
    tokens[`--kp-${kind}-border`] = s[kind][1];
    tokens[`--kp-${kind}-text`] = s[kind][2];
  }
  return tokens;
}

/** Tokens the same in light and dark: fonts, type scale, density, radii, content width. */
export function shapeTokens(preset: ThemePreset): Tokens {
  const p = PRESETS[preset];
  const f = FONTS[p.font];
  const d = DENSITY[p.density];
  const size = p.size;
  return {
    "--kp-font": f.body,
    "--kp-font-heading": f.heading,
    "--kp-heading-weight": String(f.weight),
    "--kp-heading-tracking": f.tracking,
    "--kp-font-size": `${size}px`,
    "--kp-line-height": String(p.lineHeight),
    "--kp-small": px(size * 0.875),
    "--kp-h1": px(size * p.scale ** 3.4),
    "--kp-h2": px(size * p.scale ** 2),
    "--kp-h3": px(size * p.scale),
    "--kp-space": `${d.space}px`,
    "--kp-control": `${d.control}px`,
    "--kp-cell-y": `${d.cell}px`,
    "--kp-radius": `${p.radius}px`,
    "--kp-radius-large": `${Math.round(p.radius * 1.4)}px`,
    "--kp-btn-radius": p.font === "rounded" && p.radius >= 12 ? "999px" : `${p.radius}px`,
    "--kp-content-width": p.audience === "cockpit" ? "1440px" : "1080px",
  };
}

/** Every token of a preset in one mode, as the browser sees it. */
export function themeTokens(preset: ThemePreset, dark: boolean): Tokens {
  return { ...shapeTokens(preset), ...colorTokens(preset, dark), ...statusTokens(dark) };
}

const attr = (name: string, value: string) => `[data-${name}="${value}"]`;

/** Selectors of a preset; the audience's default also applies when no preset is set. */
function presetSelectors(preset: ThemePreset): string[] {
  const own = `:root${attr("theme-preset", preset)}`;
  if (preset === DEFAULT_PRESET.kunde)
    return [`:root:not([data-theme-preset]):not(${attr("audience", "cockpit")})`, own];
  if (preset === DEFAULT_PRESET.cockpit)
    return [`:root${attr("audience", "cockpit")}:not([data-theme-preset])`, own];
  return [own];
}

function rule(selectors: readonly string[], tokens: Tokens, extra = "", indent = ""): string {
  const body = Object.entries(tokens)
    .map(([name, value]) => `${indent}  ${name}: ${value};`)
    .concat(extra ? [`${indent}  ${extra}`] : [])
    .join("\n");
  return `${indent}${selectors.join(`,\n${indent}`)} {\n${body}\n${indent}}`;
}

/**
 * The theme stylesheet: per preset the light tokens, then the dark ones twice — forced by
 * `data-color-mode="dark"` and, for `system` (or no mode), by `prefers-color-scheme`.
 * Dark selectors carry one more attribute, so they win over the light rule of the same preset.
 */
export function themesCss(): string {
  const dark = (selectors: string[]) => selectors.map((s) => `${s}${attr("color-mode", "dark")}`);
  const system = (selectors: string[]) =>
    selectors.map((s) => `${s}:not(${attr("color-mode", "light")})`);
  const blocks = [
    "/* Generated from packages/ui/src/themes.ts by scripts/build-css.mjs; do not edit. */",
    rule([":root"], statusTokens(false), "color-scheme: light;"),
    rule([`:root${attr("color-mode", "dark")}`], statusTokens(true), "color-scheme: dark;"),
    `@media (prefers-color-scheme: dark) {\n${rule(
      [`:root:not(${attr("color-mode", "light")})`],
      statusTokens(true),
      "color-scheme: dark;",
      "  ",
    )}\n}`,
  ];
  for (const preset of [...THEME_PRESETS.kunde, ...THEME_PRESETS.cockpit]) {
    const selectors = presetSelectors(preset);
    blocks.push(
      `/* ${preset} */`,
      rule(selectors, { ...shapeTokens(preset), ...colorTokens(preset, false) }),
      rule(dark(selectors), colorTokens(preset, true)),
      `@media (prefers-color-scheme: dark) {\n${rule(
        system(selectors),
        colorTokens(preset, true),
        "",
        "  ",
      )}\n}`,
    );
  }
  return `${blocks.join("\n\n")}\n`;
}
