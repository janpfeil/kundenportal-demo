import { ButtonLink, Card, Page } from "@kundenportal/ui";
import { dictionary } from "@/i18n";

const REPO_URL = "https://github.com/janpfeil/kundenportal-demo";
const REPORTS_URL = "https://janpfeil.github.io/kundenportal-demo/";

/**
 * Public demo page. It reads no session and calls no API: the content depends only on the
 * language, so it stays the same for every anonymous visitor. (The shared layout still
 * reads the session for the navigation, see docs/wiki/architektur-zonen.md.)
 */
export default async function HomePage() {
  const { t } = await dictionary();
  return (
    <Page
      variant="hero"
      title={t.home.title}
      lead={t.home.lead}
      actions={<ButtonLink href="/konto">{t.home.toPortal}</ButtonLink>}
    >
      <p className="kp-muted">{t.home.notice}</p>
      <Card title={t.home.what.title}>
        <p>{t.home.what.text}</p>
      </Card>
      <Card title={t.home.architecture.title}>
        <p>{t.home.architecture.text}</p>
      </Card>
      <Card title={t.home.code.title}>
        <p>{t.home.code.text}</p>
        <ul>
          <li>
            <a href={REPO_URL}>{t.home.code.repo}</a>
          </li>
          <li>
            <a href={REPORTS_URL}>{t.home.code.reports}</a>
          </li>
        </ul>
      </Card>
      <Card title={t.home.pass.title}>
        <p>{t.home.pass.text}</p>
      </Card>
    </Page>
  );
}
