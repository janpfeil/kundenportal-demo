"use client";

import { Card, Facts, Notice, Page, formatFileSize, formatNumber } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { useEffect, useState } from "react";
import { publicTexts } from "@/i18n/public";
import { useBrowserLocale } from "@/lib/client-state";
import { type Offer, fetchOffer } from "@/lib/offer";
import { RedeemForm } from "./redeem-form";

/** Offer as loaded in the browser: still loading, known, or not available. */
type OfferState = { kind: "loading" } | { kind: "loaded"; offer: Offer } | { kind: "failed" };

/**
 * Content of the redeem page. The page is prerendered for everyone; the current numbers
 * (duration, quotas, upload size) and whether redeeming is open come from the API.
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
    <Page title={t.title} lead={t.lead}>
      <Card title={about.title}>
        <Facts
          data-testid="redeem-offer"
          data-state={state.kind}
          items={[
            {
              term: about.duration,
              description: offer ? fill(about.durationText, { hours: offer.passHours }) : pending,
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
        <p className="kp-muted" data-testid="redeem-privacy">
          {t.privacy}
        </p>
      </Card>
      {offer && !offer.redemptionOpen ? (
        <Notice tone="warning" title={t.paused.title} data-testid="redeem-paused">
          <p>{t.paused.text}</p>
        </Notice>
      ) : state.kind !== "loading" ? (
        // Without the offer (API not reachable) redeeming may still work: show the form.
        <RedeemForm texts={t} locale={locale} />
      ) : null}
    </Page>
  );
}
