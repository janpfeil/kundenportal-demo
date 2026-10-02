import { readFileSync } from "node:fs";
import path from "node:path";
import { colorTokens, shapeTokens, statusTokens } from "@kundenportal/ui/theme";
import type { CfnManagedLoginBranding } from "aws-cdk-lib/aws-cognito";

/** The customer default preset; the sign-in page looks like the portal a visitor comes from. */
const PRESET = "klar";
const SHELL_APP = path.join(import.meta.dirname, "..", "..", "..", "apps", "shell", "src", "app");

/** Cognito wants colours as `rrggbbaa` without the hash. */
const rgba = (hex: string) => `${hex.replace(/^#/, "").toLowerCase()}ff`;

/** Mixes two `#rrggbb` colours (t = share of `b`), for hover and pressed states. */
function mix(a: string, b: string, t: number): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [channels(a), channels(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v + ((y[i] ?? v) - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

type Mode = "lightMode" | "darkMode";

/** Colours of one mode, taken from the portal's theme tokens. */
function palette(dark: boolean) {
  const t = { ...colorTokens(PRESET, dark), ...statusTokens(dark) };
  const token = (name: string) => {
    const value = t[`--kp-${name}`];
    if (!value) throw new Error(`Theme token --kp-${name} missing`);
    return value;
  };
  const accent = token("accent");
  const pressed = mix(accent, dark ? "#ffffff" : "#000000", 0.2);
  return {
    accent,
    pressed,
    contrast: token("accent-contrast"),
    accentText: token("accent-text"),
    soft: token("accent-soft"),
    bg: token("bg"),
    surface: token("surface"),
    text: token("text"),
    muted: token("muted"),
    border: token("border"),
    strong: token("border-strong"),
    input: token("input-bg"),
    focus: token("focus"),
    errorBg: token("error-bg"),
    errorBorder: token("error-border"),
  };
}

/** Builds `{ lightMode, darkMode }` from one function of the palette. */
function modes<T>(of: (p: ReturnType<typeof palette>) => T): Record<Mode, T> {
  return { lightMode: of(palette(false)), darkMode: of(palette(true)) };
}

/** Cognito rounds less than 4 px poorly; the portal's corners stay recognisable. */
const radius = Math.max(4, Number.parseFloat(shapeTokens(PRESET)["--kp-btn-radius"] ?? "4"));

/**
 * Managed-login style of the shell client: colours, corners and logo of the portal in light
 * and dark (following the visitor's system setting). Only what differs from Cognito's
 * defaults; Cognito merges the rest.
 */
export function loginBrandingSettings(): Record<string, unknown> {
  return {
    components: {
      primaryButton: modes((p) => ({
        defaults: { backgroundColor: rgba(p.accent), textColor: rgba(p.contrast) },
        hover: { backgroundColor: rgba(p.pressed), textColor: rgba(p.contrast) },
        active: { backgroundColor: rgba(p.pressed), textColor: rgba(p.contrast) },
        disabled: { backgroundColor: rgba(p.strong), borderColor: rgba(p.strong) },
      })),
      secondaryButton: modes((p) => ({
        defaults: {
          backgroundColor: rgba(p.surface),
          borderColor: rgba(p.accentText),
          textColor: rgba(p.accentText),
        },
        hover: {
          backgroundColor: rgba(p.soft),
          borderColor: rgba(p.accentText),
          textColor: rgba(p.accentText),
        },
        active: {
          backgroundColor: rgba(p.soft),
          borderColor: rgba(p.accentText),
          textColor: rgba(p.accentText),
        },
      })),
      form: {
        ...modes((p) => ({ backgroundColor: rgba(p.surface), borderColor: rgba(p.border) })),
        borderRadius: radius,
        logo: { enabled: true, location: "CENTER", position: "TOP", formInclusion: "IN" },
      },
      alert: {
        ...modes((p) => ({
          error: { backgroundColor: rgba(p.errorBg), borderColor: rgba(p.errorBorder) },
        })),
        borderRadius: radius,
      },
      favicon: { enabledTypes: ["ICO", "SVG"] },
      pageBackground: {
        image: { enabled: false },
        ...modes((p) => ({ color: rgba(p.bg) })),
      },
      pageText: modes((p) => ({
        headingColor: rgba(p.text),
        bodyColor: rgba(p.text),
        descriptionColor: rgba(p.muted),
      })),
    },
    componentClasses: {
      buttons: { borderRadius: radius },
      input: {
        ...modes((p) => ({
          defaults: { backgroundColor: rgba(p.input), borderColor: rgba(p.strong) },
          placeholderColor: rgba(p.muted),
        })),
        borderRadius: radius,
      },
      inputLabel: modes((p) => ({ textColor: rgba(p.text) })),
      inputDescription: modes((p) => ({ textColor: rgba(p.muted) })),
      link: modes((p) => ({
        defaults: { textColor: rgba(p.accentText) },
        hover: { textColor: rgba(p.pressed) },
      })),
      focusState: modes((p) => ({ borderColor: rgba(p.focus) })),
      optionControls: modes((p) => ({
        defaults: { backgroundColor: rgba(p.input), borderColor: rgba(p.strong) },
        selected: { backgroundColor: rgba(p.accent), foregroundColor: rgba(p.contrast) },
      })),
      divider: modes((p) => ({ borderColor: rgba(p.border) })),
    },
    categories: {
      global: { colorSchemeMode: "DYNAMIC" },
    },
  };
}

/**
 * The brand mark (accent tile with the bolt) and the portal's name above the form. Cognito
 * takes logos from 1:1 to 4:1 only, hence the height of 48 for a width of 184.
 */
function formLogo(dark: boolean): string {
  const { text } = palette(dark);
  const { accent, contrast } = palette(false);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 184 48" width="184" height="48">',
    `<rect x="0" y="8" width="32" height="32" rx="9" fill="${accent}"/>`,
    `<path transform="translate(0 8)" d="M17.5 6 9.5 17.5h6L14 26l8.5-11.5h-6z" fill="${contrast}"/>`,
    `<text x="44" y="32" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="20" font-weight="600" fill="${text}">Kundenportal</text>`,
    "</svg>",
  ].join("");
}

const base64 = (data: string | Buffer) => Buffer.from(data).toString("base64");

/** Favicons from the shell (the app's own icon) and the form logo, for both colour modes. */
export function loginBrandingAssets(): CfnManagedLoginBranding.AssetTypeProperty[] {
  const ico = base64(readFileSync(path.join(SHELL_APP, "favicon.ico")));
  const svg = base64(readFileSync(path.join(SHELL_APP, "icon.svg")));
  return (["LIGHT", "DARK"] as const).flatMap((colorMode) => [
    { category: "FAVICON_ICO", colorMode, extension: "ICO", bytes: ico },
    { category: "FAVICON_SVG", colorMode, extension: "SVG", bytes: svg },
    {
      category: "FORM_LOGO",
      colorMode,
      extension: "SVG",
      bytes: base64(formLogo(colorMode === "DARK")),
    },
  ]);
}
