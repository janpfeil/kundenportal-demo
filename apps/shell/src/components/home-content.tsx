"use client";

import {
  ButtonLink,
  Card,
  Grid,
  Icon,
  IconCircle,
  type IconName,
  Page,
  divisionIcon,
} from "@kundenportal/ui";
import type { Division } from "@kundenportal/api-contract";
import { publicTexts } from "@/i18n/public";
import { useBrowserLocale } from "@/lib/client-state";
import { ShellLink } from "@/lib/shell-link";

const REPO_URL = "https://github.com/janpfeil/kundenportal-demo";
const REPORTS_URL = "https://janpfeil.github.io/kundenportal-demo/";

const DIVISIONS: readonly Division[] = ["electricity", "gas", "water", "internet", "mobile"];

/** Bubbles of the illustration: centre of the circle and the division's icon. */
const BUBBLES: readonly { x: number; y: number; icon: IconName }[] = [
  { x: 78, y: 118, icon: "bolt" },
  { x: 200, y: 52, icon: "flame" },
  { x: 322, y: 118, icon: "drop" },
  { x: 92, y: 246, icon: "wifi" },
  { x: 308, y: 246, icon: "phone" },
];

/**
 * The mockup's house with the five divisions around it, drawn in theme tokens (globals.css),
 * so it follows every preset in light and dark. One image for screen readers.
 */
function HouseArt({ label }: { label: string }) {
  return (
    <svg className="home-art" viewBox="0 0 400 320" role="img" aria-label={label}>
      <path
        className="home-art-bg"
        d="M64 70C110 12 250 0 320 44s82 150 30 210-200 66-268 24S18 128 64 70z"
      />
      <path className="home-art-house" d="M140 250V160l60-50 60 50v90z" />
      <rect className="home-art-window" x="170" y="175" width="22" height="22" rx="4" />
      <rect className="home-art-window" x="208" y="175" width="22" height="22" rx="4" />
      <rect
        className="home-art-window"
        x="189"
        y="214"
        width="22"
        height="36"
        rx="4"
        opacity=".5"
      />
      {BUBBLES.map((bubble) => (
        <g key={bubble.icon}>
          <circle className="home-art-bubble" cx={bubble.x} cy={bubble.y} r="30" />
          <Icon
            name={bubble.icon}
            className="home-art-icon"
            x={bubble.x - 16}
            y={bubble.y - 16}
            width={32}
            height={32}
          />
        </g>
      ))}
    </svg>
  );
}

/** Content of the start page in the visitor's language (the page is the same for everyone). */
export function HomeContent() {
  const t = publicTexts[useBrowserLocale()].home;
  return (
    <div className="home">
      <div className="home-hero">
        <Page
          variant="hero"
          eyebrow={t.eyebrow}
          title={t.title}
          lead={t.lead}
          actions={
            <>
              {/* A full page load: /konto may send the visitor to the sign-in first. */}
              <ButtonLink href="/konto">
                {t.toPortal}
                <Icon name="right" />
              </ButtonLink>
              <ButtonLink href="/pass/einloesen" variant="secondary" linkComponent={ShellLink}>
                {t.redeem}
              </ButtonLink>
            </>
          }
        >
          <p className="home-notice">
            <Icon name="info" />
            {t.notice}
          </p>
        </Page>
        <HouseArt label={t.art} />
      </div>

      <section aria-labelledby="home-divisions">
        <h2 id="home-divisions" className="kp-sr-only">
          {t.divisionsTitle}
        </h2>
        <ul className="home-divisions">
          {DIVISIONS.map((division) => (
            <li key={division} className="kp-card home-division">
              <IconCircle name={divisionIcon(division)} />
              <strong>{t.divisions[division].name}</strong>
              <span className="kp-muted">{t.divisions[division].text}</span>
            </li>
          ))}
        </ul>
      </section>

      <Grid min="250px" className="home-cards">
        <Card as="article" title={t.what.title} headingLevel={3}>
          <p className="kp-muted">{t.what.text}</p>
        </Card>
        <Card as="article" title={t.pass.title} headingLevel={3}>
          <p className="kp-muted">{t.pass.text}</p>
          <ShellLink href="/pass/einloesen">{t.pass.more}</ShellLink>
        </Card>
        <Card as="article" title={t.code.title} headingLevel={3}>
          <p className="kp-muted">{t.code.text}</p>
          <ul className="home-links">
            <li>
              <a href={REPO_URL}>{t.code.repo}</a>
            </li>
            <li>
              <a href={REPORTS_URL}>{t.code.reports}</a>
            </li>
          </ul>
        </Card>
      </Grid>
    </div>
  );
}
