import { dictionary } from "@/i18n";
import { readSession } from "@/lib/session";

export default async function HomePage() {
  const [{ t }, session] = await Promise.all([dictionary(), readSession()]);
  return (
    <section className="hero">
      <h1>{t.home.title}</h1>
      <p className="lead">{t.home.lead}</p>
      <p>
        {session ? (
          <a className="button" href="/konto">
            {t.home.toAccount}
          </a>
        ) : (
          <a className="button" href="/auth/login">
            {t.home.register}
          </a>
        )}
      </p>
      <p className="notice">{t.home.notice}</p>
      <p className="muted">{t.home.architecture}</p>
    </section>
  );
}
