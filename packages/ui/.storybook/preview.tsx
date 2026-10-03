import type { Decorator, Preview } from "@storybook/react-vite";
import { commonTexts } from "../src/i18n/index.js";
import { isColorMode, themeAttributes } from "../src/theme-runtime.js";
import { PRESETS, THEME_PRESETS, type ThemePreset, themesCss } from "../src/themes.js";
// Same files, same order as scripts/build-css.mjs.
import "../src/styles.css";
import "../src/controls.css";
import "../src/page.css";
import "../src/widgets.css";
import "../src/charts.css";
import "../src/layout.css";
import "../src/menus.css";

// The build generates the theme tokens into dist/styles.css; Storybook takes them straight
// from themes.ts, so dev server and static build show the same values.
const themeStyle = document.createElement("style");
themeStyle.dataset["source"] = "themes.ts";
themeStyle.textContent = themesCss();
document.head.prepend(themeStyle);

const ALL_PRESETS: ThemePreset[] = [...THEME_PRESETS.kunde, ...THEME_PRESETS.cockpit];
const isPreset = (value: unknown): value is ThemePreset =>
  (ALL_PRESETS as unknown[]).includes(value);

/**
 * Theme from the toolbar: audience (from the preset), preset and colour mode as attributes on
 * <html>, exactly as the portal sets them.
 */
const withTheme: Decorator = (Story, context) => {
  const preset = isPreset(context.globals["preset"]) ? context.globals["preset"] : "klar";
  const mode = isColorMode(context.globals["mode"]) ? context.globals["mode"] : "system";
  const attributes = themeAttributes(PRESETS[preset].audience, { preset, mode });
  for (const [name, value] of Object.entries(attributes))
    document.documentElement.setAttribute(name, value);
  return <Story />;
};

/** Sets the document language so screen readers and the a11y checks use the story's locale. */
const withLocale: Decorator = (Story, context) => {
  document.documentElement.lang = context.globals["locale"] === "en" ? "en" : "de";
  return <Story />;
};

const preview: Preview = {
  globalTypes: {
    locale: {
      description: "Language of the texts",
      toolbar: {
        title: "Language",
        icon: "globe",
        items: [
          { value: "de", title: "Deutsch" },
          { value: "en", title: "English" },
        ],
        dynamicTitle: true,
      },
    },
    preset: {
      description: "Theme preset (audience follows from it)",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: ALL_PRESETS.map((preset) => ({
          value: preset,
          title: `${PRESETS[preset].audience === "kunde" ? "Endkunde" : "Cockpit"} · ${commonTexts.de.appearance.presets[preset]}`,
        })),
        dynamicTitle: true,
      },
    },
    mode: {
      description: "Colour mode; system follows prefers-color-scheme",
      toolbar: {
        title: "Mode",
        icon: "contrast",
        items: [
          { value: "system", title: "System" },
          { value: "light", title: "Hell" },
          { value: "dark", title: "Dunkel" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: "de", preset: "klar", mode: "system" },
  decorators: [withLocale, withTheme],
  parameters: {
    layout: "padded",
    a11y: { test: "error" },
    controls: { expanded: true },
    // The narrowest phone the portal supports: no horizontal scrolling at 360 px.
    viewport: {
      options: {
        phone360: {
          name: "Phone (360 px)",
          styles: { width: "360px", height: "740px" },
          type: "mobile",
        },
      },
    },
  },
};

export default preview;
