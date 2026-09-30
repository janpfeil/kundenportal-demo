import { ButtonLink, Page } from "@kundenportal/ui";
import { dictionary } from "@/i18n";
import { readSession } from "@/lib/session";

export default async function HomePage() {
  const [{ t }, session] = await Promise.all([dictionary(), readSession()]);
  return (
    <Page
      variant="hero"
      title={t.home.title}
      lead={t.home.lead}
      actions={
        session ? (
          <ButtonLink href="/konto">{t.home.toAccount}</ButtonLink>
        ) : (
          <ButtonLink href="/auth/login">{t.home.register}</ButtonLink>
        )
      }
    >
      <p className="kp-muted">{t.home.notice}</p>
      <p className="kp-muted">{t.home.architecture}</p>
    </Page>
  );
}
