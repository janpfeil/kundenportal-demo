"use client";

import { Tabs, type TabsProps } from "@kundenportal/ui";
import { TAB_PARAM } from "@/lib/consumption";

/**
 * The shared tabs, one per contract. Choosing a tab writes its contract into the address
 * (`?vertrag=`) without a navigation, so a reload or a link opens the same tab; the server
 * selects it from there.
 */
export function ContractTabs(props: Omit<TabsProps, "onChange">) {
  return (
    <Tabs
      {...props}
      onChange={(id) => {
        const url = new URL(window.location.href);
        url.searchParams.set(TAB_PARAM, id);
        // Next.js keeps its router in sync with the native History API.
        window.history.replaceState(null, "", url);
      }}
    />
  );
}
