import { Division, IsoDate, MeterUnit, ProductStatus } from "@kundenportal/events";
import { z } from "zod";
import { isMetered } from "./divisions.js";
import { TARIFFS } from "./tariffs.js";

export const ProductId = z.string().regex(/^[a-z0-9-]{2,40}$/, "Invalid product id");

/** An option of a product with its prices in one price version (integer cents). */
export const ProductOption = z.object({
  optionId: z.string().regex(/^[a-z0-9-]{1,40}$/, "Invalid option id"),
  label: z.string().min(1).max(60),
  monthlyPriceCent: z.number().int().nonnegative(),
  workPriceCent: z.number().nonnegative().optional(),
  dataVolumeMb: z.number().int().positive().optional(),
  bandwidthMbit: z.number().int().positive().optional(),
});
export type ProductOption = z.infer<typeof ProductOption>;

export const PriceVersion = z.object({
  version: z.number().int().positive(),
  validFrom: IsoDate,
  createdAt: z.iso.datetime({ offset: true }),
  options: z.array(ProductOption).min(1),
});
export type PriceVersion = z.infer<typeof PriceVersion>;

/** A product of a tenant's catalogue as the contract domain stores it. */
export const ProductRecord = z.object({
  productId: ProductId,
  division: Division,
  name: z.string().min(1),
  description: z.string(),
  status: ProductStatus,
  unit: MeterUnit.optional(),
  minimumTermMonths: z.number().int().nonnegative(),
  noticePeriodMonths: z.number().int().nonnegative(),
  /** Every price version, oldest first; versions are never changed afterwards. */
  versions: z.array(PriceVersion).min(1),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  /** Optimistic locking of the product item. */
  revision: z.number().int().positive(),
});
export type ProductRecord = z.infer<typeof ProductRecord>;

/** Notice period of the default catalogue and of contracts from before phase 7. */
export const DEFAULT_NOTICE_PERIOD_MONTHS = 1;
/** Price version 1 of the default catalogue is valid from the start of the demo year. */
export const DEFAULT_VALID_FROM = "2026-01-01";

const UMLAUTS: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/** `Strom Klassik` → `strom-klassik`: product ids of the default catalogue. */
export function productSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The default product of each division: the demo tariff catalogue from before phase 7.
 * Contracts without a product (before phase 7) belong to it with price version 1.
 */
export const DEFAULT_PRODUCT_IDS = Object.fromEntries(
  Division.options.map((division) => [division, productSlug(TARIFFS[division].tariffName)]),
) as Record<Division, string>;

const DESCRIPTIONS: Record<Division, string> = {
  electricity: "Strom für Ihren Haushalt mit monatlichem Abschlag, wahlweise als Ökostrom.",
  gas: "Erdgas für Heizung und Warmwasser, wahlweise klimaneutral.",
  water: "Trinkwasser für Ihren Haushalt mit monatlichem Abschlag.",
  internet: "Internet für Zuhause mit Flatrate in drei Geschwindigkeiten.",
  mobile: "Mobilfunk mit Allnet-Flat und Datenvolumen nach Wahl.",
};

export function unitOf(division: Division): MeterUnit | undefined {
  return TARIFFS[division].unit;
}

/** Price version 1 of a division's default product (from the demo tariffs). */
function defaultVersion(division: Division, createdAt: string): PriceVersion {
  return {
    version: 1,
    validFrom: DEFAULT_VALID_FROM,
    createdAt,
    options: TARIFFS[division].options.map((option) => {
      const result: ProductOption = {
        optionId: option.id,
        label: option.label,
        monthlyPriceCent: option.monthlyPriceCent,
      };
      if (option.workPriceCent !== undefined) result.workPriceCent = option.workPriceCent;
      if (option.dataVolumeMb !== undefined) result.dataVolumeMb = option.dataVolumeMb;
      if (option.bandwidthMbit !== undefined) result.bandwidthMbit = option.bandwidthMbit;
      return result;
    }),
  };
}

/** The default product of a division, active, as seeded into a tenant's catalogue. */
export function defaultProduct(division: Division, at: string): ProductRecord {
  const tariff = TARIFFS[division];
  const product: ProductRecord = {
    productId: DEFAULT_PRODUCT_IDS[division],
    division,
    name: tariff.tariffName,
    description: DESCRIPTIONS[division],
    status: "active",
    minimumTermMonths: tariff.minimumTermMonths,
    noticePeriodMonths: DEFAULT_NOTICE_PERIOD_MONTHS,
    versions: [defaultVersion(division, at)],
    createdAt: at,
    updatedAt: at,
    revision: 1,
  };
  if (tariff.unit) product.unit = tariff.unit;
  return product;
}

/** The division whose default product has this id, if any. */
export function defaultDivisionOf(productId: string): Division | undefined {
  return Division.options.find((division) => DEFAULT_PRODUCT_IDS[division] === productId);
}

/**
 * Price version 1 of a default product without reading the catalogue: it is seeded from
 * the same tariffs and versions never change, so the stored one is identical.
 */
export function staticVersion(productId: string, version: number): PriceVersion | undefined {
  const division = defaultDivisionOf(productId);
  if (!division || version !== 1) return undefined;
  return defaultVersion(division, `${DEFAULT_VALID_FROM}T00:00:00.000Z`);
}

/** The version new orders get: the highest one valid on `today`. */
export function currentVersion(product: ProductRecord, today: string): PriceVersion | undefined {
  return product.versions
    .filter((version) => version.validFrom <= today)
    .reduce<PriceVersion | undefined>((a, b) => (!a || b.version > a.version ? b : a), undefined);
}

/** The version a product shows: the current one, or the first upcoming one. */
export function shownVersion(product: ProductRecord, today: string): PriceVersion {
  const current = currentVersion(product, today);
  const first = product.versions[0];
  if (!current && !first) throw new Error(`Product ${product.productId} has no versions`);
  return (current ?? first) as PriceVersion;
}

export function latestVersion(product: ProductRecord): PriceVersion {
  const latest = product.versions[product.versions.length - 1];
  if (!latest) throw new Error(`Product ${product.productId} has no versions`);
  return latest;
}

/** A product as the API returns it (`Product`); operators also see versions and counts. */
export interface ProductView {
  productId: string;
  division: Division;
  name: string;
  description: string;
  status: ProductStatus;
  unit?: MeterUnit;
  minimumTermMonths: number;
  noticePeriodMonths: number;
  version: number;
  options: ProductOption[];
  versions?: PriceVersion[];
  contractCount?: Record<string, number>;
  updatedAt: string;
}

export function productView(product: ProductRecord, today: string): ProductView {
  const shown = shownVersion(product, today);
  const view: ProductView = {
    productId: product.productId,
    division: product.division,
    name: product.name,
    description: product.description,
    status: product.status,
    minimumTermMonths: product.minimumTermMonths,
    noticePeriodMonths: product.noticePeriodMonths,
    version: shown.version,
    options: shown.options,
    updatedAt: product.updatedAt,
  };
  if (product.unit) view.unit = product.unit;
  return view;
}

/** Operator's view: all versions newest first and running contracts per version. */
export function operatorProductView(
  product: ProductRecord,
  today: string,
  running: Record<number, number>,
): ProductView {
  return {
    ...productView(product, today),
    versions: [...product.versions].sort((a, b) => b.version - a.version),
    contractCount: Object.fromEntries(
      product.versions.map((v) => [String(v.version), running[v.version] ?? 0]),
    ),
  };
}

/**
 * Status moves of a product: draft → active (published) → retiring (no new orders,
 * running contracts stay) → archived (final, only without running contracts). A retiring
 * product may be activated again (the operator changed their mind), and a draft may be
 * archived directly (discarded). An active product retires before it is archived, so
 * customers never see an orderable product disappear without that step.
 */
export const STATUS_MOVES: Record<ProductStatus, readonly ProductStatus[]> = {
  draft: ["active", "archived"],
  active: ["retiring"],
  retiring: ["active", "archived"],
  archived: [],
};

const Name = z.string().trim().min(2).max(60);
const Description = z.string().trim().max(400);
const MinimumTerm = z.number().int().min(0).max(36);
const NoticePeriod = z.number().int().min(0).max(12);
const Options = z.array(ProductOption).min(1).max(6);

/** Mirrors `ProductInput` in the OpenAPI contract. */
export const ProductInput = z.strictObject({
  productId: ProductId,
  division: Division,
  name: Name,
  description: Description,
  minimumTermMonths: MinimumTerm,
  noticePeriodMonths: NoticePeriod,
  validFrom: IsoDate.optional(),
  options: Options,
});
export type ProductInput = z.infer<typeof ProductInput>;

/** Mirrors `ProductUpdate`. */
export const ProductUpdate = z
  .strictObject({
    name: Name.optional(),
    description: Description.optional(),
    minimumTermMonths: MinimumTerm.optional(),
    noticePeriodMonths: NoticePeriod.optional(),
    status: ProductStatus.optional(),
  })
  .refine((update) => Object.keys(update).length > 0, "At least one field is required");
export type ProductUpdate = z.infer<typeof ProductUpdate>;

/** Mirrors `PriceVersionInput`. */
export const PriceVersionInput = z.strictObject({ validFrom: IsoDate, options: Options });
export type PriceVersionInput = z.infer<typeof PriceVersionInput>;

/**
 * Checks a division's options: unique ids, a work price exactly for metered divisions,
 * data volume only for mobile, bandwidth only for internet. Returns a German problem
 * detail, or `undefined` if the options fit.
 */
export function optionProblem(division: Division, options: ProductOption[]): string | undefined {
  const ids = options.map((o) => o.optionId);
  if (new Set(ids).size !== ids.length) return "Jede Option braucht eine eigene Kennung.";
  for (const option of options) {
    if (isMetered(division) && option.workPriceCent === undefined) {
      return `Option ${option.optionId}: Arbeitspreis fehlt.`;
    }
    if (!isMetered(division) && option.workPriceCent !== undefined) {
      return `Option ${option.optionId}: Arbeitspreis gibt es nur bei Strom, Gas und Wasser.`;
    }
    if (division !== "mobile" && option.dataVolumeMb !== undefined) {
      return `Option ${option.optionId}: Datenvolumen gibt es nur im Mobilfunk.`;
    }
    if (division !== "internet" && option.bandwidthMbit !== undefined) {
      return `Option ${option.optionId}: Bandbreite gibt es nur bei Internet.`;
    }
  }
  return undefined;
}
