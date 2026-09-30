"use client";

import { AppShell, portalNavigation } from "@kundenportal/ui";
import { type Locale, commonTexts, otherLocale } from "@kundenportal/ui/i18n";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useBrowserLocale, useUiHint } from "@/lib/client-state";
import { ShellLink } from "@/lib/shell-link";

/** What the server knows about the visitor on pages rendered per request. */
export interface FrameState {
  locale: Locale;
  signedIn: boolean;
  roles: { cockpit: boolean; pass: boolean };
}

/** Deployed version, fixed at build time (next.config.ts). */
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

export interface ShellFrameProps {
  /**
   * Given on pages rendered per request (the server read session and language). Missing on
   * prerendered pages: then the browser decides from the language cookie or its own
   * preference and from the signed-in hint cookie.
   */
  state?: FrameState;
  children: ReactNode;
}

/**
 * Top bar, navigation and footer of every shell page. A client component because the
 * current section comes from the browser's path, which lets one prerendered layout serve
 * every public page.
 */
export function ShellFrame({ state, children }: ShellFrameProps) {
  const browserLocale = useBrowserLocale();
  const hint = useUiHint();
  const pathname = usePathname();
  const locale = state?.locale ?? browserLocale;
  const signedIn = state?.signedIn ?? hint !== undefined;
  // Hint "pass": pass status and cockpit of the own tenant; "owner": the cockpit.
  const roles = state?.roles ?? {
    cockpit: hint === "pass" || hint === "owner",
    pass: hint === "pass",
  };
  const t = commonTexts[locale];
  const target = otherLocale(locale);

  // Prerendered pages ship as German; keep the document language in step with the texts.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <AppShell
      brand={{ href: "/", label: t.brand }}
      nav={portalNavigation(t, {
        signedIn,
        current: pathname,
        roles,
      })}
      navLabel={t.nav.label}
      // Plain GET links for language and sign-in/out: the shell accepts no form posts
      // (CloudFront OAC to Lambda).
      languageLink={{
        href: `/sprache?to=${target}`,
        label: t.language.switchTo,
        hrefLang: target,
        title: t.language.label,
      }}
      authLink={
        signedIn
          ? { href: "/auth/logout", label: t.auth.logout, variant: "secondary" }
          : { href: "/auth/login", label: t.auth.login }
      }
      linkComponent={ShellLink}
      version={VERSION}
      widget={signedIn ? <kp-bell label={t.nav.mailbox} /> : undefined}
      footer={<a href={t.footer.href}>{t.footer.text}</a>}
    >
      {children}
    </AppShell>
  );
}
