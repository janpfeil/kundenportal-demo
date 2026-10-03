import { ButtonLink, Card, Facts, IconCircle, Stack, divisionIcon } from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { Dictionary } from "@/i18n";
import { type Product, groupByDivision, monthsText, optionPrice } from "@/lib/products";
import { zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export interface ProductCatalogueProps {
  products: readonly Product[];
  locale: Locale;
  t: Pick<Dictionary, "divisions" | "catalogue" | "prices">;
}

/** Path of the order page for an option of a product. */
export function orderPath(productId: string, optionId: string): string {
  return zonePath(`/neu/${encodeURIComponent(productId)}?option=${encodeURIComponent(optionId)}`);
}

/**
 * The orderable products, grouped by division (heading with the division's icon), each
 * with its terms and its options as small cards with prices and "Auswählen".
 */
export function ProductCatalogue({ products, locale, t }: ProductCatalogueProps) {
  const texts = t.catalogue;
  return (
    <div className="zone-catalogue" data-testid="product-catalogue">
      {groupByDivision(products).map(({ division, products: items }) => (
        <section
          key={division}
          className="zone-catalogue-division"
          aria-labelledby={`division-${division}`}
        >
          <h2 id={`division-${division}`} className="zone-division-title">
            <IconCircle name={divisionIcon(division)} />
            {t.divisions[division]}
          </h2>
          <Stack>
            {items.map((product) => (
              <Card
                key={product.productId}
                as="article"
                headingLevel={3}
                title={product.name}
                className="zone-product"
              >
                {product.description && <p className="zone-product-text">{product.description}</p>}
                <Facts
                  plain
                  items={[
                    {
                      term: texts.minimumTerm,
                      description: monthsText(product.minimumTermMonths, texts),
                    },
                    {
                      term: texts.noticePeriod,
                      description: monthsText(product.noticePeriodMonths, texts),
                    },
                  ]}
                />
                <ul className="zone-options">
                  {product.options.map((option) => {
                    const price = optionPrice(option, product, locale, t.prices);
                    return (
                      <li key={option.optionId} className="zone-option">
                        <h4 className="zone-option-name">{option.label}</h4>
                        <p className="zone-option-price">
                          {price.amount} <small>{price.amountLabel}</small>
                        </p>
                        {price.lines.length > 0 && (
                          <ul className="zone-option-lines">
                            {price.lines.map((line) => (
                              <li key={line.term}>
                                {line.term} <b>{line.value}</b>
                              </li>
                            ))}
                          </ul>
                        )}
                        <ButtonLink
                          href={orderPath(product.productId, option.optionId)}
                          linkComponent={ZoneLink}
                          variant="secondary"
                          className="zone-option-choose"
                          aria-label={fill(texts.chooseLabel, {
                            product: product.name,
                            option: option.label,
                          })}
                        >
                          {texts.choose}
                        </ButtonLink>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </Stack>
        </section>
      ))}
    </div>
  );
}
