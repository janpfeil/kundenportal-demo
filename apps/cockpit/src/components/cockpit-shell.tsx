"use client";

import {
  AppShell,
  type AppShellProps,
  KeyboardShortcuts,
  SearchField,
  type Shortcut,
} from "@kundenportal/ui";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ZoneLink } from "@/lib/zone-link";
import { SEARCH_PATH, type ZoneNavItem, markCurrent } from "@/lib/zone";

export interface ShellSearch {
  label: string;
  placeholder: string;
}

export interface CockpitShellProps extends Omit<AppShellProps, "nav" | "search" | "linkComponent"> {
  nav: readonly ZoneNavItem[];
  /** The top bar's search (cockpit visitors only). */
  search?: ShellSearch | undefined;
  /** Key sequences such as "g c" → overview. */
  shortcuts?: readonly Shortcut[] | undefined;
}

/** The search field, filled with the query while the result page is open. */
function TopSearch({ label, placeholder }: ShellSearch) {
  const pathname = usePathname();
  const params = useSearchParams();
  const onResults = pathname === "/suche" || pathname === SEARCH_PATH;
  const query = onResults ? (params.get("q") ?? "") : "";
  return (
    <SearchField
      key={query}
      action={SEARCH_PATH}
      label={label}
      placeholder={placeholder}
      defaultValue={query}
    />
  );
}

/**
 * The zone's frame: the shared AppShell with the cockpit's navigation, its search field and
 * keyboard shortcuts. A client component only to know the current page (sidebar marker and
 * the query of the search field); everything else comes rendered from the layout.
 */
export function CockpitShell({ nav, search, shortcuts, children, ...shell }: CockpitShellProps) {
  const pathname = usePathname();
  return (
    <AppShell
      {...shell}
      nav={markCurrent(nav, pathname)}
      linkComponent={ZoneLink}
      search={
        search ? (
          // useSearchParams needs a boundary for pages rendered ahead of time (e.g. 404).
          <Suspense fallback={<SearchField action={SEARCH_PATH} {...search} />}>
            <TopSearch {...search} />
          </Suspense>
        ) : undefined
      }
    >
      {shortcuts && shortcuts.length > 0 && <KeyboardShortcuts shortcuts={shortcuts} />}
      {children}
    </AppShell>
  );
}
