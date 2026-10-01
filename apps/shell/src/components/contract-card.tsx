import {
  Card,
  FakeMarker,
  Icon,
  IconCircle,
  Meter,
  Sparkline,
  StatusBadge,
  divisionIcon,
  formatDate,
  formatQuantity,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { Dictionary } from "@/i18n";
import { type ContractCardView, type ContractState, cardPrice, volumePair } from "@/lib/overview";

type Texts = Dictionary["overview"]["contracts"];

function Trend({ card, texts, locale }: { card: ContractCardView; texts: Texts; locale: Locale }) {
  const { trend } = card;
  if (trend.kind === "sparkline") {
    return (
      <Sparkline
        className="contract-trend"
        values={trend.values}
        width={220}
        height={40}
        label={fill(texts.trend, {
          min: formatQuantity(Math.round(trend.min), trend.unit, locale),
          max: formatQuantity(Math.round(trend.max), trend.unit, locale),
        })}
      />
    );
  }
  if (trend.kind === "estimate") {
    return (
      <p className="kp-muted contract-note">
        {fill(texts.estimate, {
          amount: formatQuantity(Math.round(trend.annual), trend.unit, locale),
        })}
      </p>
    );
  }
  if (trend.kind === "usage") {
    const pair = volumePair(trend.usedMb, trend.includedMb, locale);
    const text = fill(texts.used, pair);
    return (
      // The used volume is a demo model of the API (no mobile network): marked as such.
      <div className="contract-usage">
        <Meter
          label={texts.volume}
          value={trend.usedMb}
          max={trend.includedMb}
          valueText={text}
          thin
          hideLabel
        />
        <p className="kp-muted contract-note">
          {text} <FakeMarker locale={locale} />
        </p>
      </div>
    );
  }
  return null;
}

/** "aktiv", "gekündigt zum 31.03.2027" (notice pending, still running), "beendet", "widerrufen". */
function StateBadge({
  state,
  texts,
  locale,
}: {
  state: ContractState;
  texts: Texts;
  locale: Locale;
}) {
  if (state.kind === "noticed")
    return (
      <StatusBadge tone="warn">
        {fill(texts.statuses.noticed, { date: formatDate(state.effectiveDate, locale) })}
      </StatusBadge>
    );
  return (
    <StatusBadge tone={state.kind === "active" ? "ok" : "neutral"}>
      {texts.statuses[state.kind]}
    </StatusBadge>
  );
}

/** The last tile of the contract grid: on to the product catalogue of the contracts zone. */
export function NewContractCard({ texts }: { texts: Texts }) {
  return (
    <a className="kp-card contract-new" href="/vertraege/neu" data-testid="new-contract">
      <IconCircle name="plus" />
      <span className="contract-new-text">
        <b>{texts.newContract}</b>
        <span className="kp-muted">{texts.newContractText}</span>
      </span>
    </a>
  );
}

/**
 * A contract tile of the overview as in the mockup: division icon, tariff, sub line, price,
 * consumption trend or data volume, status and a link to the contract's details.
 */
export function ContractCard({
  card,
  texts,
  locale,
}: {
  card: ContractCardView;
  texts: Texts;
  locale: Locale;
}) {
  const headingId = `contract-${card.contractId}`;
  return (
    <Card as="article" className="contract" aria-labelledby={headingId}>
      <div className="contract-top">
        <IconCircle name={divisionIcon(card.division)} />
        <div className="contract-name">
          <h3 id={headingId}>{card.title}</h3>
          <span className="kp-muted">{card.sub}</span>
        </div>
      </div>
      <p className="contract-price">
        {cardPrice(card.priceCent, locale)}{" "}
        <small>{card.priceKind === "installment" ? texts.installment : texts.monthly}</small>
      </p>
      <Trend card={card} texts={texts} locale={locale} />
      <div className="contract-foot">
        <span className="contract-badges">
          <StateBadge state={card.state} texts={texts} locale={locale} />
          {card.blocked && <StatusBadge tone="err">{texts.statuses.blocked}</StatusBadge>}
        </span>
        <a
          className="contract-more"
          href={`/vertraege/${encodeURIComponent(card.contractId)}`}
          aria-label={fill(texts.detailsOf, { tariff: card.title })}
        >
          {texts.details}
          <Icon name="right" />
        </a>
      </div>
    </Card>
  );
}
