import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell, type NavItem } from "../components/app-shell.js";
import { Page } from "../components/page.js";
import { otherLocale } from "../i18n/index.js";
import { storyTexts } from "./texts.js";

interface Args {
  signedIn: boolean;
  withWidget: boolean;
}

const meta: Meta<Args> = {
  title: "Layout/AppShell",
  args: { signedIn: false, withWidget: false },
  parameters: { layout: "fullscreen" },
  render: ({ signedIn, withWidget }, { globals }) => {
    const { locale, common: t, demo } = storyTexts(globals);
    const nav: NavItem[] = [
      { href: "#start", label: t.nav.home, active: !signedIn },
      ...(signedIn
        ? [
            { href: "#konto", label: t.nav.account, active: true },
            { href: "#postfach", label: t.nav.mailbox },
            { href: "#vertraege", label: t.nav.contracts },
            { href: "#verbrauch", label: t.nav.consumption },
          ]
        : []),
    ];
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
export const SignedIn: Story = { args: { signedIn: true } };
export const WithNotificationWidget: Story = { args: { signedIn: true, withWidget: true } };
export const DarkMode: Story = { args: { signedIn: true }, globals: { theme: "dark" } };
export const English: Story = { args: { signedIn: true }, globals: { locale: "en" } };
export const Phone360: Story = {
  args: { signedIn: true, withWidget: true },
  globals: { viewport: { value: "phone360" } },
};
