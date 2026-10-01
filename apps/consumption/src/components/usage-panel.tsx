import type { Contract, DataUsage } from "@kundenportal/api-contract";
import {
  Button,
  Card,
  FakeMarker,
  Icon,
  Notice,
  ProgressRing,
  formatDateTime,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { Dictionary } from "@/i18n";
import { billingPeriod, formatVolume, gigabytes } from "@/lib/consumption";

export interface UsagePanelProps {
  contract: Contract;
  /** The month's usage; `undefined` if it could not be loaded. */
  usage: DataUsage | undefined;
  locale: Locale;
  t: Dictionary;
}

/**
 * A mobile contract's tab: the data volume as a ring, the billing period and what is left.
 * The usage comes from the API's demo model (there is no mobile network) and "1 GB nachbuchen"
 * books nothing; both carry the "Demo-Wert" marker (docs/wiki/design.md, "Gefakte Elemente").
 */
export function UsagePanel({ contract, usage, locale, t }: UsagePanelProps) {
  const title = fill(t.usage.title, { tariff: contract.tariffName });
  if (!usage) {
    return (
      <Card as="section" title={title}>
        <Notice tone="error">{t.usage.error}</Notice>
      </Card>
    );
  }
  const volume = (mb: number) => formatVolume(mb, locale);
  const noteId = `usage-note-${usage.contractId}`;
  const titleId = `usage-title-${usage.contractId}`;
  const inGigabytes = usage.includedMb >= 1024;
  return (
    <Card as="section" aria-labelledby={titleId} data-testid="usage">
      <div className="zone-hero">
        <div className="zone-hero-ring">
          <ProgressRing
            value={usage.usedMb}
            max={usage.includedMb}
            size={128}
            label={fill(t.usage.ring, {
              used: volume(usage.usedMb),
              included: volume(usage.includedMb),
              percent: usage.usedPercent,
            })}
            center={
              inGigabytes ? gigabytes(usage.usedMb, locale) : String(Math.round(usage.usedMb))
            }
            sub={fill(t.usage.of, { included: volume(usage.includedMb) })}
          />
          <FakeMarker locale={locale} />
        </div>
        <div className="zone-hero-body">
          <h2 className="kp-card-title" id={titleId}>
            {title}
          </h2>
          <p className="kp-muted">
            {fill(t.usage.text, {
              period: billingPeriod(usage.month, locale),
              left: volume(Math.max(usage.includedMb - usage.usedMb, 0)),
            })}
          </p>
          <p className="kp-muted zone-small">
            {fill(t.usage.asOf, { time: formatDateTime(usage.asOf, locale) })}
          </p>
          {usage.usedPercent >= usage.thresholdPercent && (
            <Notice tone="warning">{fill(t.usage.warning, { percent: usage.usedPercent })}</Notice>
          )}
          <div className="zone-buttons">
            {/* Fake action: there is no booking of extra volume yet, so it stays disabled. */}
            <Button variant="secondary" disabled aria-describedby={noteId}>
              <Icon name="plus" />
              {t.usage.topUp}
            </Button>
            <FakeMarker locale={locale} />
          </div>
          <p className="kp-muted zone-small" id={noteId}>
            {t.usage.topUpNote}
          </p>
        </div>
      </div>
    </Card>
  );
}
