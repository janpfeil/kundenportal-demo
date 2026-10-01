import { Fragment, type ReactNode, useId } from "react";
import { type CommonTexts, fill } from "../i18n/index.js";
import { AppearanceMenu, type AppearanceSettings } from "./appearance-menu.js";
import { Footer } from "./footer.js";
import { Icon, type IconName } from "./icon.js";
import { type LinkComponent, joinClasses } from "./link.js";
import { UserMenu, type UserMenuProps } from "./user-menu.js";

export interface NavItem {
  href: string;
  label: string;
  /** Marks the current zone/page (aria-current="page"). */
  active?: boolean;
  /** Icon before the label (top bar from 1240 px, sidebar, above the label in the bottom bar). */
  icon?: IconName | undefined;
  /** Open items, e.g. 14 clarification cases; spoken as "14 offen" with `navTexts`. */
  count?: number | undefined;
  /** Keyboard shortcut hint, e.g. "g c" (sidebar only; see KeyboardShortcuts). */
  kbd?: string | undefined;
  /** Sidebar only: starts a section with this heading, e.g. "Migration". */
  group?: string | undefined;
  /** Sidebar only: an indented entry, usually an anchor on the page above, e.g. "#klaerfaelle". */
  sub?: boolean | undefined;
}

export interface TopBarProps {
  brand: {
    href: string;
    label: string;
    /** Muted addition after the label, e.g. "Cockpit". */
    suffix?: string | undefined;
  };
  /**
   * Zone navigation; pass only the entries the visitor may use. Section headings (`group`),
   * indented entries (`sub`) and shortcut hints (`kbd`) appear in the sidebar only; the top
   * bar and the bottom bar show the plain entries.
   */
  nav: readonly NavItem[];
  /** Accessible name of the navigation landmark, e.g. "Hauptnavigation". */
  navLabel: string;
  /** Accessible name of the sidebar navigation, if it differs (default `navLabel`). */
  sideNavLabel?: string | undefined;
  /** Spoken texts of counters and shortcut hints, e.g. the shared `nav` texts. */
  navTexts?: Pick<CommonTexts["nav"], "openCount" | "shortcut"> | undefined;
  /** Search field in the top bar (e.g. SearchField); hidden on phones. */
  search?: ReactNode;
  /**
   * Language switch. `label` is the visible text and thus the accessible name (e.g. "English");
   * `hrefLang` is the target language.
   */
  languageLink?: { href: string; label: string; hrefLang: string; title?: string };
  /** Sign-in (primary) or sign-out (secondary) link. Plain GET link, no form. */
  authLink?: { href: string; label: string; variant?: "primary" | "secondary" };
  /** Signed-in user: avatar, name and a menu with the sign-out; replaces `authLink`. */
  user?: UserMenuProps | undefined;
  /**
   * Theme switch ("Darstellung"): inside the user menu when signed in, else a small menu
   * button next to the language link.
   */
  appearance?: AppearanceSettings | undefined;
  /** Slot for the notification bell widget. */
  widget?: ReactNode;
  /** Deployed version, e.g. "v0.4.1 · 1a2b3c4"; shown next to the brand. */
  version?: string | undefined;
  linkComponent?: LinkComponent;
}

interface NavEntryProps {
  item: NavItem;
  side: boolean;
  texts: TopBarProps["navTexts"];
  Link: LinkComponent;
}

function NavEntry({ item, side, texts, Link }: NavEntryProps) {
  return (
    <li className={item.sub ? "kp-nav-sub" : undefined}>
      <Link href={item.href} aria-current={item.active ? "page" : undefined}>
        {item.icon && !item.sub && <Icon name={item.icon} className="kp-nav-icon" />}
        <span className="kp-nav-label">{item.label}</span>
        {/* Spaces between the parts keep the accessible name readable ("Klärfälle 14 offen");
            the flex layout ignores them. */}
        {item.count !== undefined && (
          <>
            {" "}
            <span className="kp-nav-count">
              <span aria-hidden="true">{item.count}</span>
              <span className="kp-sr-only">
                {texts ? fill(texts.openCount, { count: item.count }) : item.count}
              </span>
            </span>
          </>
        )}
        {side && item.kbd && (
          <>
            {" "}
            <kbd className="kp-kbd kp-nav-kbd">
              <span aria-hidden="true">{item.kbd}</span>
              <span className="kp-sr-only">
                {texts ? fill(texts.shortcut, { keys: item.kbd }) : item.kbd}
              </span>
            </kbd>
          </>
        )}
      </Link>
    </li>
  );
}

interface SideSection {
  heading: string | undefined;
  items: NavItem[];
}

/** The sidebar's entries, split into sections at every `group` heading. */
function sideSections(nav: readonly NavItem[]): SideSection[] {
  const sections: SideSection[] = [];
  for (const item of nav) {
    const last = sections[sections.length - 1];
    if (item.group !== undefined || !last) sections.push({ heading: item.group, items: [item] });
    else last.items.push(item);
  }
  return sections;
}

export function TopBar({
  brand,
  nav,
  navLabel,
  sideNavLabel,
  navTexts,
  search,
  languageLink,
  authLink,
  widget,
  version,
  user,
  appearance,
  linkComponent: Link = "a",
}: TopBarProps) {
  const groupId = useId();
  // A separate sidebar only when it shows more than the plain entries; otherwise the one
  // navigation moves between top bar, sidebar and bottom bar (layout.css).
  const sidebar = nav.some((item) => item.group !== undefined || item.sub || item.kbd);
  return (
    <header className="kp-topbar">
      <Link href={brand.href} className="kp-brand">
        <Icon name="logo" className="kp-brand-logo" />
        {brand.label}
        {brand.suffix && (
          <>
            {" "}
            <em>{brand.suffix}</em>
          </>
        )}
      </Link>
      {version && (
        <span className="kp-version" data-testid="app-version">
          {version}
        </span>
      )}
      {/* Placement (top bar, sidebar, bottom bar) and marker come from the theme (layout.css). */}
      <nav aria-label={navLabel} className="kp-nav">
        <ul>
          {nav
            .filter((item) => !item.sub)
            .map((item) => (
              <NavEntry key={item.href} item={item} side={false} texts={navTexts} Link={Link} />
            ))}
        </ul>
      </nav>
      {sidebar && (
        <nav aria-label={sideNavLabel ?? navLabel} className="kp-sidenav">
          {sideSections(nav).map((section, index) => {
            const id = section.heading !== undefined ? `${groupId}-${index}` : undefined;
            return (
              <Fragment key={`${index}-${section.heading ?? ""}`}>
                {id && (
                  <p className="kp-nav-group" id={id}>
                    {section.heading}
                  </p>
                )}
                <ul aria-labelledby={id}>
                  {section.items.map((item) => (
                    <NavEntry key={item.href} item={item} side texts={navTexts} Link={Link} />
                  ))}
                </ul>
              </Fragment>
            );
          })}
        </nav>
      )}
      <div className="kp-actions">
        {search !== undefined && <div className="kp-topbar-search">{search}</div>}
        {widget}
        {languageLink && (
          <a
            className="kp-language"
            href={languageLink.href}
            hrefLang={languageLink.hrefLang}
            lang={languageLink.hrefLang}
            title={languageLink.title}
          >
            {languageLink.label}
          </a>
        )}
        {!user && appearance && <AppearanceMenu {...appearance} />}
        {user && <UserMenu appearance={appearance} {...user} />}
        {!user && authLink && (
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

/**
 * Page frame of every zone: top bar, main content area and footer. How it looks (colours,
 * fonts, density, where the navigation sits) follows the theme attributes on <html>.
 */
export function AppShell({ footer, children, ...topBar }: AppShellProps) {
  const plain = topBar.nav.filter((item) => !item.sub).length;
  return (
    // A lone entry ("Start" for signed-out visitors) never gets a sidebar or bottom bar.
    <div className="kp-shell" data-nav-entries={plain > 1 ? "many" : "few"}>
      <TopBar {...topBar} />
      <main className="kp-main">{children}</main>
      {footer !== undefined && <Footer>{footer}</Footer>}
    </div>
  );
}
