# @kundenportal/ui

Component library, design tokens and shared translations for all zones of the
customer portal (Next.js multi-zones). Plain React 19 components and one CSS file;
no CSS-in-JS. None of the components holds client state, so all of them work as
React Server Components.

## Usage

```tsx
// Root layout of a zone
import { AppShell, Page, Facts, Notice } from "@kundenportal/ui";
import { commonTexts, negotiateLocale, otherLocale } from "@kundenportal/ui/i18n";
import "@kundenportal/ui/styles.css";
```

- **Themes and tokens**: the tokens are CSS custom properties (`--kp-*`),
  computed per preset from `src/themes.ts` (customer: Klar, Vertrauen, Warm,
  Klassisch; cockpit: Dicht, Übersicht, Kontrast) and written into
  `dist/styles.css` by the build. Attributes on `<html>` select one:
  `data-audience`, `data-theme-preset`, `data-color-mode` (`light`, `dark`,
  `system`). `@kundenportal/ui/theme` (no React) reads and validates the
  cookies (`readThemeChoice`), builds the attributes (`themeAttributes`),
  applies a choice (`applyTheme`) and provides the init script for
  prerendered pages (`themeInitScript`). `themes.test.ts` checks WCAG AA
  contrast for every preset in both modes.
- **Appearance switch**: `TopBar`/`AppShell` take `appearance={{ audience, texts }}`;
  signed in it is a section of the user menu, signed out a small menu button.
- **Components**: `AppShell`/`TopBar` (brand, zone navigation, language link,
  sign-in/out link, slot for the notification bell), `Page`, `Card`, `Facts`,
  `DataTable`, `Button`/`ButtonLink`, `TextField`, `NumberField`, `Select`,
  `Notice`, `Badge`, `EmptyState`, `Footer`. Links default to plain `<a>` (a
  full page load between zones); pass `linkComponent` for client-side
  navigation inside a zone.
- **i18n**: `Locale` (`"de" | "en"`), `negotiateLocale(cookie, acceptLanguage)`,
  the shared cookie name `LOCALE_COOKIE` and `commonTexts` (navigation,
  sign-in/out, language switch, footer). Zone-specific texts stay in the zones.
- Accessibility: the visible label is always the accessible name; the layout
  works at 360 px without horizontal scrolling.

## Scripts

| Script                 | Does                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm build`           | `tsc` to `dist` (ESM + `.d.ts`), writes `styles.css` (themes + styles), builds Storybook |
| `pnpm test`            | Vitest with jsdom and Testing Library                                                    |
| `pnpm storybook`       | Storybook dev server on port 6006                                                        |
| `pnpm build-storybook` | Static Storybook only                                                                    |

## Storybook

Stories live in `src/stories`. The toolbar switches the language (Deutsch/English),
the theme preset (all seven) and the colour mode (system/light/dark); a 360 px viewport is preconfigured. The
Pages workflow publishes the static Storybook together with the concept reports
under `/storybook/`.
