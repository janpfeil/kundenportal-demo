import { AppShell } from "@kundenportal/ui";
import { otherLocale } from "@kundenportal/ui/i18n";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { dictionary } from "@/i18n";
import { currentSession } from "@/lib/session";
import { navigation } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";
import "@kundenportal/ui/styles.css";
import "./zone.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t, common } = await dictionary();
  return { title: `${t.title} · ${common.brand} (Demo)`, robots: { index: false } };
}

export default async function ZoneLayout({ children }: { children: ReactNode }) {
  const [{ locale, common: t }, session] = await Promise.all([dictionary(), currentSession()]);
  const target = otherLocale(locale);
  return (
    <html lang={locale}>
      <head>
        {/* Runtime widget, published by the edge; the same script the shell loads. */}
        <script type="module" src="/widgets/bell.js" async />
      </head>
      <body>
        {/* Language and sign-in/out are shell routes: plain links, a full page load. */}
        <AppShell
          brand={{ href: "/", label: t.brand }}
          nav={navigation(t, Boolean(session))}
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
          linkComponent={ZoneLink}
          widget={
            session ? (
              <kp-bell label={t.nav.mailbox} href="/postfach" src="/postfach/anzahl" />
            ) : undefined
          }
          footer={<a href={t.footer.href}>{t.footer.text}</a>}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
