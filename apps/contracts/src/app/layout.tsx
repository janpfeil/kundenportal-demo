import type { ReactNode } from "react";

export const metadata = {
  title: "Verträge & Rechnungen · Kundenportal (Demo)",
  robots: { index: false },
};

export default function ZoneLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
