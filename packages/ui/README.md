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

- **Tokens** are CSS custom properties (`--kp-*`). Light and dark follow
  `prefers-color-scheme`; `data-theme="light|dark"` on `<html>` forces one.
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

| Script                 | Does                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm build`           | `tsc` to `dist` (ESM + `.d.ts`), copies `styles.css`, builds Storybook to `storybook-static` |
| `pnpm test`            | Vitest with jsdom and Testing Library                                                        |
| `pnpm storybook`       | Storybook dev server on port 6006                                                            |
| `pnpm build-storybook` | Static Storybook only                                                                        |

## Storybook

Stories live in `src/stories`. The toolbar switches the language (Deutsch/English)
and the theme (system/light/dark); a 360 px viewport is preconfigured. The
Pages workflow publishes the static Storybook together with the concept reports
under `/storybook/`.
