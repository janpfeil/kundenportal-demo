import { withThemeByDataAttribute } from "@storybook/addon-themes";
import type { Decorator, Preview } from "@storybook/react-vite";
import "../src/styles.css";

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
  },
  initialGlobals: { locale: "de" },
  decorators: [
    withLocale,
    // "system" follows the OS (prefers-color-scheme); light/dark force a theme via data-theme.
    withThemeByDataAttribute({
      themes: { system: "system", light: "light", dark: "dark" },
      defaultTheme: "system",
      attributeName: "data-theme",
      parentSelector: "html",
    }),
  ],
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
