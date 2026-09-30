import type { Metadata } from "next";
import { PASS_GROUP, groupsOf } from "@kundenportal/web-auth";
import type { ReactNode } from "react";
import { ShellFrame } from "@/components/shell-frame";
import { dictionary } from "@/i18n";
import { readSession } from "@/lib/session";
import "@kundenportal/ui/styles.css";
import "../globals.css";

export const metadata: Metadata = {
  title: "Kundenportal (Demo)",
  description: "Multi-utility customer portal — demo project",
  robots: { index: false },
};

/**
 * Root layout of the signed-in area (account, mailbox, pass status), rendered per request:
 * it reads the session and the language, so the frame is right from the first byte. The
 * public pages have their own, prerendered root layout (`(public)/layout.tsx`).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const [{ locale }, session] = await Promise.all([dictionary(), readSession()]);
  // Pass holders get a link to their pass status; read from the token, no extra API call.
  const passHolder = session ? groupsOf(session.accessToken).includes(PASS_GROUP) : false;
  return (
    <html lang={locale}>
      <head>
        {/* Runtime widget, published by the edge; loaded at runtime so it can change on its own. */}
        <script type="module" src="/widgets/bell.js" async />
      </head>
      <body>
        <ShellFrame state={{ locale, signedIn: Boolean(session), passHolder }}>
          {children}
        </ShellFrame>
      </body>
    </html>
  );
}
