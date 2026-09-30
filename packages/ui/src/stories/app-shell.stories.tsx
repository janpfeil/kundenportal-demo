import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell } from "../components/app-shell.js";
import { Page } from "../components/page.js";
import { otherLocale } from "../i18n/index.js";
import { portalNavigation } from "../navigation.js";
import { storyTexts } from "./texts.js";

interface Args {
  signedIn: boolean;
  withWidget: boolean;
  /** Path of the current page; its section is marked (aria-current="page"). */
  current: string;
}

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
        authLink={
          signedIn
            ? { href: "#logout", label: t.auth.logout, variant: "secondary" }
            : { href: "#login", label: t.auth.login }
        }
        widget={withWidget ? <a href="#glocke">{demo.bell}</a> : undefined}
        footer={<a href={t.footer.href}>{t.footer.text}</a>}
      >
        <Page title={signedIn ? demo.accountTitle : demo.heroTitle} lead={demo.lead} />
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
  globals: { theme: "dark" },
};
export const English: Story = {
  args: { signedIn: true, current: "/konto" },
  globals: { locale: "en" },
};
export const Phone360: Story = {
  args: { signedIn: true, withWidget: true, current: "/vertraege" },
  globals: { viewport: { value: "phone360" } },
};
