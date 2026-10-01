import { afterEach, describe, expect, it } from "vitest";
import {
  THEME_COOKIES,
  applyTheme,
  currentTheme,
  parseCookies,
  readThemeChoice,
  themeAttributes,
  themeCookie,
  themeInitScript,
} from "./theme-runtime.js";

function clearCookies() {
  for (const name of document.cookie.split(";").map((part) => part.split("=")[0]?.trim()))
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
}

function resetRoot(attributes: Record<string, string> = {}) {
  const root = document.documentElement;
  for (const name of [...root.getAttributeNames()]) root.removeAttribute(name);
  for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value);
  return root;
}

afterEach(() => {
  clearCookies();
  resetRoot();
});

describe("parseCookies", () => {
  it("reads name/value pairs, decodes values and keeps the first of duplicates", () => {
    const cookies = parseCookies("a=1; kp_theme_kunde=warm; b=x%20y; a=2; broken; c=%E0%A4%A");
    expect(cookies.get("a")).toBe("1");
    expect(cookies.get("kp_theme_kunde")).toBe("warm");
    expect(cookies.get("b")).toBe("x y");
    expect(cookies.has("broken")).toBe(false);
    expect(cookies.has("c")).toBe(false);
    expect(parseCookies(undefined).size).toBe(0);
  });
});

describe("readThemeChoice", () => {
  const from = (values: Record<string, string>) => (name: string) => values[name];

  it("takes valid cookie values", () => {
    expect(
      readThemeChoice("kunde", from({ kp_theme_kunde: "vertrauen", kp_color_mode: "dark" })),
    ).toEqual({ preset: "vertrauen", mode: "dark" });
    expect(readThemeChoice("cockpit", from({ kp_theme_cockpit: "kontrast" }))).toEqual({
      preset: "kontrast",
      mode: "system",
    });
  });

  it("falls back to the defaults for missing, unknown or foreign values", () => {
    expect(readThemeChoice("kunde", from({}))).toEqual({ preset: "klar", mode: "system" });
    expect(readThemeChoice("cockpit", from({}))).toEqual({ preset: "dicht", mode: "system" });
    // A cockpit preset is not a customer preset, and vice versa.
    expect(readThemeChoice("kunde", from({ kp_theme_kunde: "dicht" })).preset).toBe("klar");
    expect(readThemeChoice("cockpit", from({ kp_theme_cockpit: "warm" })).preset).toBe("dicht");
    expect(
      readThemeChoice("kunde", from({ kp_theme_kunde: "<script>", kp_color_mode: "dim" })),
    ).toEqual({ preset: "klar", mode: "system" });
  });
});

describe("themeAttributes", () => {
  it("adds the layout of the preset", () => {
    expect(themeAttributes("cockpit")).toEqual({
      "data-audience": "cockpit",
      "data-theme-preset": "dicht",
      "data-color-mode": "system",
      "data-nav": "side",
      "data-nav-marker": "pill",
    });
    expect(themeAttributes("kunde", { preset: "warm", mode: "light" })).toMatchObject({
      "data-theme-preset": "warm",
      "data-color-mode": "light",
      "data-nav": "bottom",
    });
  });
});

describe("themeCookie", () => {
  it("is site-wide, lax, a year long and secure behind HTTPS", () => {
    expect(themeCookie("kp_color_mode", "dark", true)).toBe(
      "kp_color_mode=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
    expect(themeCookie("kp_color_mode", "dark", false)).not.toContain("Secure");
  });
});

describe("applyTheme", () => {
  it("sets the attributes at once and remembers the choice in cookies", () => {
    const root = resetRoot(themeAttributesRecord("kunde"));
    expect(applyTheme({ preset: "vertrauen" })).toEqual({ preset: "vertrauen", mode: "system" });
    expect(root.dataset["themePreset"]).toBe("vertrauen");
    expect(root.dataset["nav"]).toBe("top");
    expect(root.dataset["navMarker"]).toBe("pill");
    applyTheme({ mode: "dark" });
    expect(root.dataset["colorMode"]).toBe("dark");
    const cookies = parseCookies(document.cookie);
    expect(cookies.get(THEME_COOKIES.kunde)).toBe("vertrauen");
    expect(cookies.get(THEME_COOKIES.mode)).toBe("dark");
    expect(cookies.has(THEME_COOKIES.cockpit)).toBe(false);
  });

  it("ignores presets of the other audience and unknown modes", () => {
    const root = resetRoot(themeAttributesRecord("cockpit"));
    applyTheme({ preset: "warm" as never, mode: "sepia" as never });
    expect(currentTheme(root)).toEqual({ audience: "cockpit", preset: "dicht", mode: "system" });
    expect(document.cookie).toBe("");
  });
});

describe("themeInitScript", () => {
  const run = () => new Function(themeInitScript())();

  it("applies valid cookies for the page's audience", () => {
    const root = resetRoot(themeAttributesRecord("kunde"));
    document.cookie = "kp_theme_kunde=klassisch; Path=/";
    document.cookie = "kp_theme_cockpit=kontrast; Path=/";
    document.cookie = "kp_color_mode=dark; Path=/";
    run();
    expect(root.dataset["themePreset"]).toBe("klassisch");
    expect(root.dataset["nav"]).toBe("side");
    expect(root.dataset["navMarker"]).toBe("solid");
    expect(root.dataset["colorMode"]).toBe("dark");

    const cockpit = resetRoot(themeAttributesRecord("cockpit"));
    run();
    expect(cockpit.dataset["themePreset"]).toBe("kontrast");
  });

  it("leaves the server's defaults for invalid cookies", () => {
    const root = resetRoot(themeAttributesRecord("kunde"));
    document.cookie = "kp_theme_kunde=dicht; Path=/";
    document.cookie = "kp_color_mode=hacker; Path=/";
    run();
    expect(root.dataset["themePreset"]).toBe("klar");
    expect(root.dataset["colorMode"]).toBe("system");
    document.cookie = "kp_theme_kunde=constructor; Path=/";
    run();
    expect(root.dataset["themePreset"]).toBe("klar");
  });
});

function themeAttributesRecord(audience: "kunde" | "cockpit"): Record<string, string> {
  return { ...themeAttributes(audience) };
}
