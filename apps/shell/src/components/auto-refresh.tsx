"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page every `seconds` while the tab is visible (e.g. while a pass is set up). */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
