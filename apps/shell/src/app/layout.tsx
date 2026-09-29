import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { dictionary } from "@/i18n";
import { readSession } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kundenportal (Demo)",
  description: "Multi-utility customer portal — demo project",
  robots: { index: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [{ locale, t }, session] = await Promise.all([dictionary(), readSession()]);
  const otherLocale = locale === "de" ? "en" : "de";
  return (
    <html lang={locale}>
      <body>
        <header className="top">
          <Link href="/" className="brand">
            {t.brand}
          </Link>
          <nav aria-label="main">
            <Link href="/">{t.nav.home}</Link>
            {session && <Link href="/konto">{t.nav.account}</Link>}
            {session && <Link href="/postfach">{t.nav.mailbox}</Link>}
          </nav>
          <div className="actions">
            {/* Plain GET links: the shell accepts no POST requests (CloudFront OAC to Lambda). */}
            <a
              href={`/sprache?to=${otherLocale}`}
              hrefLang={otherLocale}
              aria-label={t.language.label}
            >
              {t.language.switchTo}
            </a>
            {session ? (
              <a href="/auth/logout" className="button secondary">
                {t.nav.logout}
              </a>
            ) : (
              <a href="/auth/login" className="button">
                {t.nav.login}
              </a>
            )}
          </div>
        </header>
        <main>{children}</main>
        <footer>
          <a href="https://github.com/janpfeil/kundenportal-demo">{t.footer}</a>
        </footer>
      </body>
    </html>
  );
}
