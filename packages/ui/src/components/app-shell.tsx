import type { ReactNode } from "react";
import { Footer } from "./footer.js";
import { type LinkComponent, joinClasses } from "./link.js";

export interface NavItem {
  href: string;
  label: string;
  /** Marks the current zone/page (aria-current="page"). */
  active?: boolean;
}

export interface TopBarProps {
  brand: { href: string; label: string };
  /** Zone navigation; pass only the entries the visitor may use. */
  nav: readonly NavItem[];
  /** Accessible name of the navigation landmark, e.g. "Hauptnavigation". */
  navLabel: string;
  /**
   * Language switch. `label` is the visible text and thus the accessible name (e.g. "English");
   * `hrefLang` is the target language.
   */
  languageLink?: { href: string; label: string; hrefLang: string; title?: string };
  /** Sign-in (primary) or sign-out (secondary) link. Plain GET link, no form. */
  authLink?: { href: string; label: string; variant?: "primary" | "secondary" };
  /** Slot for the notification bell widget. */
  widget?: ReactNode;
  linkComponent?: LinkComponent;
}

export function TopBar({
  brand,
  nav,
  navLabel,
  languageLink,
  authLink,
  widget,
  linkComponent: Link = "a",
}: TopBarProps) {
  return (
    <header className="kp-topbar">
      <Link href={brand.href} className="kp-brand">
        {brand.label}
      </Link>
      <nav aria-label={navLabel} className="kp-nav">
        <ul>
          {nav.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={item.active ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="kp-actions">
        {widget}
        {languageLink && (
          <a
            href={languageLink.href}
            hrefLang={languageLink.hrefLang}
            lang={languageLink.hrefLang}
            title={languageLink.title}
          >
            {languageLink.label}
          </a>
        )}
        {authLink && (
          <a
            href={authLink.href}
            className={joinClasses(
              "kp-button",
              authLink.variant === "secondary" && "kp-button-secondary",
            )}
          >
            {authLink.label}
          </a>
        )}
      </div>
    </header>
  );
}

export interface AppShellProps extends TopBarProps {
  /** Footer content; defaults to nothing. */
  footer?: ReactNode;
  children: ReactNode;
}

/** Page frame of every zone: top bar, main content area and footer. */
export function AppShell({ footer, children, ...topBar }: AppShellProps) {
  return (
    <div className="kp-shell">
      <TopBar {...topBar} />
      <main className="kp-main">{children}</main>
      {footer !== undefined && <Footer>{footer}</Footer>}
    </div>
  );
}
