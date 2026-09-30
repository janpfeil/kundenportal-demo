import { AppShell, type NavItem } from "@kundenportal/ui";
import { otherLocale } from "@kundenportal/ui/i18n";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { dictionary } from "@/i18n";
import { readSession } from "@/lib/session";
import { ShellLink } from "@/lib/shell-link";
import "@kundenportal/ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kundenportal (Demo)",
  description: "Multi-utility customer portal — demo project",
  robots: { index: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [{ locale, common: t }, session] = await Promise.all([dictionary(), readSession()]);
  const target = otherLocale(locale);
  const nav: NavItem[] = [
    { href: "/", label: t.nav.home },
    // Zones for signed-in customers; /vertraege and /verbrauch are served by their own zones.
    ...(session
      ? [
          { href: "/konto", label: t.nav.account },
          { href: "/postfach", label: t.nav.mailbox },
          { href: "/vertraege", label: t.nav.contracts },
          { href: "/verbrauch", label: t.nav.consumption },
        ]
      : []),
  ];
  return (
    <html lang={locale}>
      <head>
        {/* Runtime widget, published by the edge; loaded at runtime so it can change on its own. */}
        <script type="module" src="/widgets/bell.js" async />
      </head>
      <body>
        {/* Plain GET links for language and sign-in/out: the shell accepts no POST requests (CloudFront OAC to Lambda). */}
        <AppShell
          brand={{ href: "/", label: t.brand }}
          nav={nav}
          navLabel={t.nav.label}
          languageLink={{
            href: `/sprache?to=${target}`,
            label: t.language.switchTo,
            hrefLang: target,
            title: t.language.label,
          }}
          authLink={
            session
              ? { href: "/auth/logout", label: t.auth.logout, variant: "secondary" }
              : { href: "/auth/login", label: t.auth.login }
          }
          linkComponent={ShellLink}
          widget={session ? <kp-bell label={t.nav.mailbox} /> : undefined}
          footer={<a href={t.footer.href}>{t.footer.text}</a>}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
