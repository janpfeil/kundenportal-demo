"use client";

import { ButtonLink, Card, Page } from "@kundenportal/ui";
import { publicTexts } from "@/i18n/public";
import { useBrowserLocale } from "@/lib/client-state";

const REPO_URL = "https://github.com/janpfeil/kundenportal-demo";
const REPORTS_URL = "https://janpfeil.github.io/kundenportal-demo/";

/** Content of the start page in the visitor's language (the page is the same for everyone). */
export function HomeContent() {
  const t = publicTexts[useBrowserLocale()].home;
  return (
    <Page
      variant="hero"
      title={t.title}
      lead={t.lead}
      actions={<ButtonLink href="/konto">{t.toPortal}</ButtonLink>}
    >
      <p className="kp-muted">{t.notice}</p>
      <Card title={t.what.title}>
        <p>{t.what.text}</p>
      </Card>
      <Card title={t.architecture.title}>
        <p>{t.architecture.text}</p>
      </Card>
      <Card title={t.code.title}>
        <p>{t.code.text}</p>
        <ul>
          <li>
            <a href={REPO_URL}>{t.code.repo}</a>
          </li>
          <li>
            <a href={REPORTS_URL}>{t.code.reports}</a>
          </li>
        </ul>
      </Card>
      <Card title={t.pass.title}>
        <p>{t.pass.text}</p>
      </Card>
    </Page>
  );
}
