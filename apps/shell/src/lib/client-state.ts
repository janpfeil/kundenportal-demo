"use client";

import { LOCALE_COOKIE, type Locale, negotiateLocale } from "@kundenportal/ui/i18n";
import { useSyncExternalStore } from "react";
import { UI_HINT_COOKIE, type UiHint, cookieValue, isUiHint } from "./ui-hint";

// Cookies change only through full page loads (language switch, sign-in, sign-out), so
// there is nothing to subscribe to; the value is read once per render in the browser.
const noSubscription = () => () => {};

/** Language of a prerendered page: the explicit choice (cookie), else the browser's. */
export function browserLocale(): Locale {
  return negotiateLocale(
    cookieValue(document.cookie, LOCALE_COOKIE),
    navigator.languages.join(","),
  );
}

/**
 * The visitor's language on prerendered pages. The prerendered HTML is German (the server
 * snapshot); after hydration React switches to the visitor's language if it differs.
 */
export function useBrowserLocale(): Locale {
  return useSyncExternalStore(noSubscription, browserLocale, () => "de");
}

/** The signed-in hint (see ui-hint.ts); `undefined` when signed out or before hydration. */
export function useUiHint(): UiHint | undefined {
  return useSyncExternalStore(
    noSubscription,
    () => {
      const value = cookieValue(document.cookie, UI_HINT_COOKIE);
      return isUiHint(value) ? value : undefined;
    },
    () => undefined,
  );
}
