import { Card, Facts, Page } from "@kundenportal/ui";
import type { Metadata } from "next";
import { RedeemForm } from "@/components/redeem-form";
import { dictionary } from "@/i18n";

// The invitation token is in the URL fragment; keep it out of Referer headers of any
// outgoing request as well (the fragment is never sent, this also drops path and query).
export const metadata: Metadata = { referrer: "no-referrer" };

/** Public page that redeems a demo-pass invitation (`/pass/einloesen#<token>`). */
export default async function RedeemPage() {
  const { locale, t } = await dictionary();
  const about = t.redeem.about;
  return (
    <Page title={t.redeem.title} lead={t.redeem.lead}>
      <Card title={about.title}>
        <Facts
          items={[
            { term: about.duration, description: about.durationText },
            { term: about.instance, description: about.instanceText },
            { term: about.quota, description: about.quotaText },
            { term: about.data, description: about.dataText },
          ]}
        />
        <p className="kp-muted" data-testid="redeem-privacy">
          {t.redeem.privacy}
        </p>
      </Card>
      <RedeemForm texts={t.redeem} locale={locale} />
    </Page>
  );
}
