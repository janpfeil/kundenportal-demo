import { describe, expect, it } from "vitest";
import { contrastRatio } from "./color.js";
import {
  COLOR_MODES,
  DEFAULT_PRESET,
  PRESETS,
  THEME_PRESETS,
  type ThemePreset,
  type Tokens,
  themeTokens,
  themesCss,
} from "./themes.js";

const ALL: ThemePreset[] = [...THEME_PRESETS.kunde, ...THEME_PRESETS.cockpit];

type Token = keyof Tokens;

/** Text pairs need 4.5:1 (WCAG 2.2 AA, 1.4.3); focus ring and accent shapes 3:1 (1.4.11). */
const PAIRS: [label: string, fg: Token, bg: Token, min: number][] = [
  ["text / surface", "--kp-text", "--kp-surface", 4.5],
  ["text / page", "--kp-text", "--kp-bg", 4.5],
  ["text / surface-2", "--kp-text", "--kp-surface-2", 4.5],
  ["text / unread", "--kp-text", "--kp-unread", 4.5],
  ["muted / surface", "--kp-muted", "--kp-surface", 4.5],
  ["muted / page", "--kp-muted", "--kp-bg", 4.5],
  ["muted / surface-2", "--kp-muted", "--kp-surface-2", 4.5],
  ["link / surface", "--kp-accent-text", "--kp-surface", 4.5],
  ["link / page", "--kp-accent-text", "--kp-bg", 4.5],
  ["current nav entry / accent-soft", "--kp-accent-text", "--kp-accent-soft", 4.5],
  ["button text / accent", "--kp-accent-contrast", "--kp-accent", 4.5],
  ["text / input", "--kp-text", "--kp-input-bg", 4.5],
  ["error text / surface", "--kp-error-text", "--kp-surface", 4.5],
  ["success text / surface", "--kp-success-text", "--kp-surface", 4.5],
  ["warning text / surface", "--kp-warning-text", "--kp-surface", 4.5],
  ["info text / surface", "--kp-info-text", "--kp-surface", 4.5],
  ["error text / page", "--kp-error-text", "--kp-bg", 4.5],
  ["text / error-bg", "--kp-text", "--kp-error-bg", 4.5],
  ["text / warning-bg", "--kp-text", "--kp-warning-bg", 4.5],
  ["text / info-bg", "--kp-text", "--kp-info-bg", 4.5],
  ["text / success-bg", "--kp-text", "--kp-success-bg", 4.5],
  // Status badges and the "Demo-Wert" marker: status text on its own tinted background.
  ["success text / success-bg", "--kp-success-text", "--kp-success-bg", 4.5],
  ["warning text / warning-bg", "--kp-warning-text", "--kp-warning-bg", 4.5],
  ["error text / error-bg", "--kp-error-text", "--kp-error-bg", 4.5],
  ["info text / info-bg", "--kp-info-text", "--kp-info-bg", 4.5],
  // Previews and times in unread messages.
  ["muted / unread", "--kp-muted", "--kp-unread", 4.5],
  // Counters in the bottom bar.
  ["counter / accent", "--kp-accent-contrast", "--kp-accent", 4.5],
  ["focus ring / page", "--kp-focus", "--kp-bg", 3],
  ["focus ring / surface", "--kp-focus", "--kp-surface", 3],
  ["accent / page", "--kp-accent", "--kp-bg", 3],
  ["input border / input", "--kp-muted", "--kp-input-bg", 3],
];

describe("theme contrast (WCAG 2.2 AA)", () => {
  for (const preset of ALL) {
    for (const dark of [false, true]) {
      it(`${preset} ${dark ? "dark" : "light"}`, () => {
        const tokens = themeTokens(preset, dark);
        const failures = PAIRS.flatMap(([label, fg, bg, min]) => {
          const a = tokens[fg];
          const b = tokens[bg];
          if (!a || !b) return [`${label}: token missing`];
          const ratio = contrastRatio(a, b);
          return ratio >= min ? [] : [`${label}: ${a} on ${b} = ${ratio.toFixed(2)} < ${min}`];
        });
        expect(failures).toEqual([]);
      });
    }
  }
});

describe("presets", () => {
  it("follow the owner's decision", () => {
    expect(DEFAULT_PRESET).toEqual({ kunde: "klar", cockpit: "dicht" });
    expect(THEME_PRESETS.kunde[0]).toBe("klar");
    expect(THEME_PRESETS.cockpit[0]).toBe("dicht");
    for (const audience of ["kunde", "cockpit"] as const)
      for (const preset of THEME_PRESETS[audience]) expect(PRESETS[preset].audience).toBe(audience);
  });

  it("place the navigation as in the mockup", () => {
    expect(PRESETS.dicht.nav).toBe("side");
    expect(PRESETS.kontrast.nav).toBe("side");
    expect(PRESETS.uebersicht.nav).toBe("top");
    expect(PRESETS.klassisch.nav).toBe("side");
    expect(PRESETS.warm.nav).toBe("bottom");
    expect(PRESETS.klar.nav).toBe("top");
    expect(PRESETS.vertrauen.nav).toBe("top");
  });

  it("keep the existing green accent in Klar", () => {
    expect(themeTokens("klar", false)["--kp-accent"]).toBe("#0b6e4f");
  });

  it("give customer pages touch targets of at least 44 px", () => {
    for (const preset of THEME_PRESETS.kunde)
      expect(Number.parseInt(themeTokens(preset, false)["--kp-control"] ?? "0")).toBeGreaterThan(
        43,
      );
  });
});

describe("themesCss", () => {
  const css = themesCss();

  it("has a light rule and both dark rules for every preset", () => {
    for (const preset of ALL) {
      expect(css).toContain(`:root[data-theme-preset="${preset}"] {`);
      expect(css).toContain(`:root[data-theme-preset="${preset}"][data-color-mode="dark"]`);
      expect(css).toContain(`:root[data-theme-preset="${preset}"]:not([data-color-mode="light"])`);
    }
    expect(COLOR_MODES).toEqual(["light", "dark", "system"]);
  });

  it("falls back to the audience's default without a preset attribute", () => {
    expect(css).toContain(':root:not([data-theme-preset]):not([data-audience="cockpit"]),');
    expect(css).toContain(':root[data-audience="cockpit"]:not([data-theme-preset]),');
  });

  it("writes exactly the computed token values", () => {
    const light = themeTokens("vertrauen", false);
    expect(css).toContain(`  --kp-accent: ${light["--kp-accent"]};`);
    expect(css).toContain("  --kp-font-size: 16px;");
    // Balanced braces: every rule is closed.
    expect(css.split("{").length).toBe(css.split("}").length);
  });
});
