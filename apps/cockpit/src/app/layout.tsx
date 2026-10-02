import { Icon } from "@kundenportal/ui";
import { fill, otherLocale } from "@kundenportal/ui/i18n";
import { APP_ICONS, readThemeChoice, themeAttributes } from "@kundenportal/ui/theme";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { CockpitShell } from "@/components/cockpit-shell";
import { dictionary } from "@/i18n";
import { currentSession } from "@kundenportal/web-auth/pages";
import { loadStatus } from "@/lib/status";
import { accessOf } from "@/lib/tenancy";
import {
  MIGRATION_PATH,
  cockpitNavigation,
  cockpitShortcuts,
  navigation,
  zonePath,
} from "@/lib/zone";
import "@kundenportal/ui/styles.css";
import "./zone.css";
import "./operator.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t, common } = await dictionary();
  return {
    title: `${t.operator.appTitle} · ${common.brand} (Demo)`,
    robots: { index: false },
    ...APP_ICONS,
  };
}

const REPORTS_URL = "https://janpfeil.github.io/kundenportal-demo/";
const STORYBOOK_URL = "https://janpfeil.github.io/kundenportal-demo/storybook/";

export default async function ZoneLayout({ children }: { children: ReactNode }) {
  const [{ locale, t, common }, session, jar] = await Promise.all([
    dictionary(),
    currentSession(),
    cookies(),
  ]);
  // The visitor's theme from the shared cookies, rendered on the server (no flash).
  const theme = readThemeChoice("cockpit", (name) => jar.get(name)?.value);
  const target = otherLocale(locale);
  const access = session ? accessOf(session) : "none";
  // Owner and pass holders get the cockpit's frame; the counts come from the same status
  // the overview loads (one API call per request, see loadStatus).
  const cockpit = session && access !== "none";
  const status = cockpit ? (await loadStatus(session)).status : undefined;
  const fresh = status?.trends.newClarifications;

  const nav = cockpit
    ? cockpitNavigation({ ...t.frame, passStatus: common.nav.pass }, access, {
        clarifications: status?.clarifications.length,
        deadLetters: status?.deadLetters.length,
      })
    : navigation(common, session);

  const bell = cockpit ? (
    <a
      className="cockpit-bell"
      href={`${MIGRATION_PATH}#klaerfaelle`}
      aria-label={
        fresh === undefined || fresh === 0
          ? t.frame.bellNone
          : fresh === 1
            ? t.frame.bellOne
            : fill(t.frame.bell, { count: fresh })
      }
      data-testid="cockpit-bell"
    >
      <Icon name="bell" />
      {fresh !== undefined && fresh > 0 && (
        <span className="cockpit-bell-count" aria-hidden="true">
          {fresh}
        </span>
      )}
    </a>
  ) : session ? (
    // Without cockpit access: the portal's mailbox bell, as in the other zones.
    <kp-bell label={common.nav.mailbox} href="/postfach" src="/postfach/anzahl" />
  ) : undefined;

  const userLinks = cockpit
    ? [
        ...(access === "owner" ? [{ href: zonePath("/paesse"), label: t.frame.passes }] : []),
        ...(access === "pass" ? [{ href: "/pass", label: common.nav.pass }] : []),
        { href: "/konto", label: t.frame.toPortal },
        { href: "/konto", label: common.nav.account },
      ]
    : [{ href: "/konto", label: common.nav.account }];

  return (
    <html lang={locale} {...themeAttributes("cockpit", theme)}>
      <head>
        {/* Runtime widget, published by the edge; the same script the shell loads. */}
        {session && !cockpit && <script type="module" src="/widgets/bell.js" async />}
      </head>
      <body>
        {/* Language and sign-in/out are shell routes: plain links, a full page load. */}
        <CockpitShell
          brand={{
            href: cockpit ? zonePath() : "/",
            label: common.brand,
            suffix: t.frame.brandSuffix,
          }}
          nav={nav}
          navLabel={common.nav.label}
          sideNavLabel={cockpit ? t.frame.sideNav : undefined}
          navTexts={common.nav}
          appearance={{ audience: "cockpit", texts: common.appearance }}
          languageLink={{
            href: `/sprache?to=${target}`,
            label: common.language.switchTo,
            hrefLang: target,
            title: common.language.label,
          }}
          {...(session
            ? {
                user: {
                  name: session.name,
                  email: session.email,
                  label: common.auth.menu,
                  links: userLinks,
                  logout: { href: "/auth/logout", label: common.auth.logout },
                },
              }
            : { authLink: { href: "/auth/login", label: common.auth.login } })}
          search={
            cockpit ? { label: t.frame.search, placeholder: t.frame.searchPlaceholder } : undefined
          }
          shortcuts={cockpit ? cockpitShortcuts(access) : undefined}
          version={process.env.NEXT_PUBLIC_APP_VERSION}
          widget={bell}
          footer={
            cockpit ? (
              <span className="cockpit-footer">
                <span>{t.frame.footer}</span>
                <a href={REPORTS_URL}>{t.frame.reports}</a>
                <a href={STORYBOOK_URL}>{t.frame.storybook}</a>
                <a href={common.footer.href}>{common.footer.text}</a>
              </span>
            ) : (
              <a href={common.footer.href}>{common.footer.text}</a>
            )
          }
        >
          {children}
        </CockpitShell>
      </body>
    </html>
  );
}
