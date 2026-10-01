"use client";

import {
  Card,
  Facts,
  IconCircle,
  Notice,
  Page,
  ProgressRing,
  Split,
  Stack,
  formatFileSize,
  formatNumber,
} from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { useEffect, useState } from "react";
import { publicTexts } from "@/i18n/public";
import { useBrowserLocale } from "@/lib/client-state";
import { type Offer, fetchOffer } from "@/lib/offer";
import { RedeemForm } from "./redeem-form";

/** Offer as loaded in the browser: still loading, known, or not available. */
type OfferState = { kind: "loading" } | { kind: "loaded"; offer: Offer } | { kind: "failed" };

/**
 * Content of the redeem page, in the visual language of the pass page: a hero card with the
 * pass duration as ring, the three steps and the form, then what the pass offers and the
 * privacy note. The page is prerendered for everyone; the current numbers (duration,
 * quotas, upload size) and whether redeeming is open come from the API.
 */
export function RedeemPage() {
  const locale = useBrowserLocale();
  const t = publicTexts[locale].redeem;
  const about = t.about;
  const [state, setState] = useState<OfferState>({ kind: "loading" });

  useEffect(() => {
    const abort = new AbortController();
    void fetchOffer(abort.signal).then((offer) => {
      if (!abort.signal.aborted) setState(offer ? { kind: "loaded", offer } : { kind: "failed" });
    });
    return () => abort.abort();
  }, []);

  const offer = state.kind === "loaded" ? state.offer : undefined;
  const pending = state.kind === "loading" ? about.loading : about.unavailable;
  const number = (value: number) => formatNumber(value, locale);
  return (
    <Page eyebrow={t.eyebrow} title={t.title} lead={t.lead}>
      <Stack gap="large">
        <Card as="section" className="pass-hero" aria-labelledby="redeem-steps">
          {offer ? (
            <ProgressRing
              size={128}
              value={offer.passHours}
              max={offer.passHours}
              center={fill(t.ring.center, { hours: offer.passHours })}
              sub={t.ring.sub}
              label={fill(t.ring.label, { hours: offer.passHours })}
            />
          ) : (
            <IconCircle name="ticket" className="redeem-icon" />
          )}
          <div className="pass-hero-body">
            <h2 id="redeem-steps">{t.stepsTitle}</h2>
            <ol className="redeem-steps">
              <li>{t.steps.check}</li>
              <li>{t.steps.redeem}</li>
              <li>{t.steps.signIn}</li>
            </ol>
            {offer && !offer.redemptionOpen ? (
              <Notice tone="warning" title={t.paused.title} data-testid="redeem-paused">
                <p>{t.paused.text}</p>
              </Notice>
            ) : state.kind !== "loading" ? (
              // Without the offer (API not reachable) redeeming may still work: show the form.
              <RedeemForm texts={t} locale={locale} />
            ) : null}
          </div>
        </Card>
        <Split>
          <Card as="section" title={about.title} icon="ticket">
            <Facts
              data-testid="redeem-offer"
              data-state={state.kind}
              items={[
                {
                  term: about.duration,
                  description: offer
                    ? fill(about.durationText, { hours: offer.passHours })
                    : pending,
                },
                { term: about.instance, description: about.instanceText },
                {
                  term: about.quota,
                  description: offer
                    ? fill(about.quotaText, {
                        api: number(offer.quotas.api),
                        events: number(offer.quotas.events),
                        uploads: number(offer.quotas.uploads),
                        size: formatFileSize(offer.uploadMaxBytes, locale),
                      })
                    : pending,
                },
                { term: about.data, description: about.dataText },
              ]}
            />
          </Card>
          <Card as="section" title={t.privacyTitle} icon="shield">
            <p className="kp-muted" data-testid="redeem-privacy">
              {t.privacy}
            </p>
          </Card>
        </Split>
      </Stack>
    </Page>
  );
}
