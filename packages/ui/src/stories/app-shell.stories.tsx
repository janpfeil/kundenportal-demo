import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { AppShell } from "../components/app-shell.js";
import { Card, Page } from "../components/page.js";
import { otherLocale } from "../i18n/index.js";
import { portalNavigation } from "../navigation.js";
import { PRESETS, type ThemePreset } from "../themes.js";
import { storyTexts } from "./texts.js";

interface Args {
  signedIn: boolean;
  withWidget: boolean;
  /** Path of the current page; its section is marked (aria-current="page"). */
  current: string;
}

/**
 * The frame of every zone. The toolbar's "Theme" and "Mode" switch preset and colour mode;
 * where the navigation sits (top bar, sidebar from 960 px, bottom bar on phones) follows the
 * preset. The user menu (and, signed out, the "Darstellung" button) offers the presets of
 * the audience the toolbar's preset belongs to.
 */
const meta: Meta<Args> = {
  title: "Layout/AppShell",
  args: { signedIn: false, withWidget: false, current: "/" },
  argTypes: {
    current: {
      control: "select",
      options: ["/", "/konto", "/postfach", "/vertraege/123", "/verbrauch", "/cockpit/paesse"],
    },
  },
  parameters: { layout: "fullscreen" },
  render: ({ signedIn, withWidget, current }, { globals }) => {
    const { locale, common: t, demo } = storyTexts(globals);
    const preset = (globals["preset"] ?? "klar") as ThemePreset;
    const audience = PRESETS[preset]?.audience ?? "kunde";
    // Real paths, so the current section is marked as in the portal; the links lead nowhere.
    const nav = portalNavigation(t, {
      signedIn,
      current,
      extra: [{ href: "/cockpit", label: t.nav.cockpit }],
    });
    const target = otherLocale(locale);
    return (
      <AppShell
        brand={{ href: "#start", label: t.brand }}
        nav={nav}
        navLabel={t.nav.label}
        languageLink={{
          href: `#sprache-${target}`,
          label: t.language.switchTo,
          hrefLang: target,
          title: t.language.label,
        }}
        version="v0.4.1 · 1a2b3c4"
        appearance={{ audience, texts: t.appearance }}
        {...(signedIn
          ? {
              user: {
                name: "Anna Becker",
                email: "anna.becker@example.org",
                label: t.auth.menu,
                links: [{ href: "#konto", label: t.nav.account }],
                logout: { href: "#logout", label: t.auth.logout },
              },
            }
          : { authLink: { href: "#login", label: t.auth.login } })}
        widget={withWidget ? <a href="#glocke">{demo.bell}</a> : undefined}
        footer={<a href={t.footer.href}>{t.footer.text}</a>}
      >
        <Page title={signedIn ? demo.accountTitle : demo.heroTitle} lead={demo.lead}>
          <Card title={demo.address}>
            <p>{demo.addressText}</p>
          </Card>
        </Page>
      </AppShell>
    );
  },
};

export default meta;
type Story = StoryObj<Args>;

export const SignedOut: Story = {};
export const SignedIn: Story = { args: { signedIn: true, current: "/konto" } };
/** A zone marks its own entry, here the contracts zone on a contract's detail page. */
export const CurrentSectionInZone: Story = {
  args: { signedIn: true, current: "/vertraege/123" },
};
export const WithNotificationWidget: Story = {
  args: { signedIn: true, withWidget: true, current: "/postfach" },
};
export const DarkMode: Story = {
  args: { signedIn: true, current: "/verbrauch" },
  globals: { mode: "dark" },
};
export const English: Story = {
  args: { signedIn: true, current: "/konto" },
  globals: { locale: "en" },
};
export const Phone360: Story = {
  args: { signedIn: true, withWidget: true, current: "/vertraege" },
  globals: { viewport: { value: "phone360" } },
};

/** The user menu with its "Darstellung" section: presets of the audience and colour mode. */
export const UserMenuOpen: Story = {
  args: { signedIn: true, current: "/konto" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Benutzermenü|User menu/ }));
  },
};

/** Signed out: the appearance switch sits next to the language link. */
export const AppearanceMenuSignedOut: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Darstellung|Appearance/ }));
  },
};

/** Cockpit default "Dicht": sidebar navigation on wide screens. */
export const CockpitDense: Story = {
  args: { signedIn: true, current: "/cockpit/paesse" },
  globals: { preset: "dicht" },
};

/** Cockpit "Kontrast" in dark mode: solid marker in the sidebar. */
export const CockpitContrastDark: Story = {
  args: { signedIn: true, current: "/cockpit" },
  globals: { preset: "kontrast", mode: "dark" },
};

/** Customer "Klassisch": serif headings and a sidebar. */
export const CustomerClassic: Story = {
  args: { signedIn: true, current: "/vertraege" },
  globals: { preset: "klassisch" },
};

/** Customer "Warm" on a phone: the navigation moves to a bar at the bottom. */
export const CustomerWarmPhone: Story = {
  args: { signedIn: true, current: "/verbrauch" },
  globals: { preset: "warm", viewport: { value: "phone360" } },
};
