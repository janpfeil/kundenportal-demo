import { AppShell, ButtonLink, Page } from "@kundenportal/ui";
import { commonTexts } from "@kundenportal/ui/i18n";
import type { Metadata } from "next";
import "@kundenportal/ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seite nicht gefunden · Page not found — Kundenportal (Demo)",
  robots: { index: false },
};

/**
 * 404 for every path no route matches. The shell has two root layouts (public pages
 * prerendered, signed-in area per request), so there is no single layout to wrap a 404 in;
 * this page is complete on its own, prerendered and bilingual.
 */
export default function GlobalNotFound() {
  const t = commonTexts.de;
  return (
    <html lang="de">
      <body>
        <AppShell
          brand={{ href: "/", label: t.brand }}
          nav={[{ href: "/", label: t.nav.home }]}
          navLabel={t.nav.label}
          footer={<a href={t.footer.href}>{t.footer.text}</a>}
        >
          <Page
            title="Seite nicht gefunden"
            lead="Diese Adresse gibt es im Kundenportal nicht."
            actions={<ButtonLink href="/">Zur Startseite</ButtonLink>}
          >
            <div lang="en">
              <h2>Page not found</h2>
              <p>
                This address does not exist in the customer portal.{" "}
                <a href="/">Go to the home page</a>.
              </p>
            </div>
          </Page>
        </AppShell>
      </body>
    </html>
  );
}
