import { loginUrl, readSession } from "@kundenportal/web-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ZoneHome() {
  const session = await readSession();
  if (!session) redirect(loginUrl("/vertraege"));
  return (
    <main>
      <h1>Verträge & Rechnungen</h1>
      <p data-testid="zone-session">{session.email ?? session.sub}</p>
      <p>
        <a href="/">Kundenportal</a>
      </p>
    </main>
  );
}
