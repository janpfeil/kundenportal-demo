import { THEME_INIT_PATH, themeAttributes } from "@kundenportal/ui/theme";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ShellFrame } from "@/components/shell-frame";
import "@kundenportal/ui/styles.css";
import "../globals.css";

export const metadata: Metadata = {
  title: "Kundenportal (Demo)",
  description: "Multi-utility customer portal — demo project",
  robots: { index: false },
};

/**
 * Root layout of the public pages (start page, redeem page). It reads neither cookies nor
 * headers, so Next.js prerenders these pages once at build time and the edge can cache
 * them for every visitor. Language and signed-in state are applied in the browser
 * (ShellFrame); the HTML itself is German. The theme ships as the customer default and
 * `/theme-init.js` applies the visitor's choice from the cookies before the first paint
 * (hence `suppressHydrationWarning`: the attributes on <html> may differ from the HTML).
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" {...themeAttributes("kunde")} suppressHydrationWarning>
      <head>
        {/* Synchronous on purpose: sets the theme attributes before the body is painted. */}
        <script src={THEME_INIT_PATH} />
        {/* Runtime widget, published by the edge; used once the browser knows the visitor is signed in. */}
        <script type="module" src="/widgets/bell.js" async />
      </head>
      <body>
        <ShellFrame>{children}</ShellFrame>
      </body>
    </html>
  );
}
