import { type ReactNode, useId } from "react";
import { formatNumber } from "../format.js";
import { type CommonTexts, type Locale, commonTexts } from "../i18n/index.js";
import { joinClasses } from "./link.js";

export interface ChartLegendItem {
  /** Swatch: filled bar, dashed comparison line or hatched (estimated) bar. */
  kind: "current" | "previous" | "estimated";
  label: ReactNode;
}

export interface ChartLegendProps {
  items: readonly ChartLegendItem[];
  className?: string | undefined;
}

/** The legend above a chart, e.g. "Okt 2025 – Sep 2026", "Vorjahr", "geschätzt". */
export function ChartLegend({ items, className }: ChartLegendProps) {
  return (
    <ul className={joinClasses("kp-chart-legend", className)}>
      {items.map((item) => (
        <li key={item.kind}>
          <span className={`kp-legend-swatch kp-legend-${item.kind}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export interface BarChartProps {
  /** Short label per bar on the x axis, e.g. "Okt", "Nov", … */
  labels: readonly string[];
  values: readonly number[];
  /** Comparison values (previous year), drawn as a dashed line; `null` leaves a gap. */
  previous?: readonly (number | null)[] | undefined;
  /** Bars whose value is estimated rather than measured; drawn hatched and named so. */
  estimated?: readonly boolean[] | undefined;
  /** Unit of the values, e.g. "kWh". */
  unit: string;
  /** Accessible name of the chart and caption of its table. */
  title: string;
  /** Number formatting and default texts. */
  locale: Locale;
  /** Legend text of the bars, e.g. "Okt 2025 – Sep 2026"; without it the chart has no legend. */
  rangeLabel?: string | undefined;
  /** Decimal places of the values (default 0). */
  fractionDigits?: number | undefined;
  /** Overrides the shared texts ("Vorjahr", "geschätzt", "Als Tabelle anzeigen", "Monat"). */
  texts?: Partial<CommonTexts["chart"]> | undefined;
  className?: string | undefined;
}

const WIDTH = 640;
const HEIGHT = 250;
const TOP = 22;
const BOTTOM = 30;
const RIGHT = 10;

/** A round axis maximum (1, 2, 2.5 or 5 × 10ⁿ per step) that splits into four steps. */
export function niceMaximum(largest: number): number {
  if (!(largest > 0)) return 4;
  const raw = largest / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= raw) ?? raw;
  return step * 4;
}

/**
 * Monthly bars with an optional dashed comparison line (previous year), the latest bar
 * emphasised with its value, a hover title per bar, and the same numbers as a real table
 * behind "Als Tabelle anzeigen". Scales to its container (viewBox, width 100 %).
 */
export function BarChart({
  labels,
  values,
  previous,
  estimated,
  unit,
  title,
  locale,
  rangeLabel,
  fractionDigits = 0,
  texts,
  className,
}: BarChartProps) {
  const t = { ...commonTexts[locale].chart, ...texts };
  // Referenced from url(#…): keep only characters that need no escaping.
  const hatchId = `kp-hatch-${useId().replace(/[^\w-]/g, "")}`;
  const factor = 10 ** fractionDigits;
  const format = (value: number) => formatNumber(Math.round(value * factor) / factor, locale);
  const clean = values.map((value) => (Number.isFinite(value) ? Math.max(value, 0) : 0));
  const comparison = (previous ?? []).map((value) =>
    value !== null && Number.isFinite(value) ? Math.max(value, 0) : null,
  );
  const max = niceMaximum(Math.max(0, ...clean, ...comparison.map((value) => value ?? 0)));
  const ticks = [0, 1, 2, 3, 4].map((k) => (max / 4) * k);
  // Room for the longest axis label, also at the larger font size on phones.
  const left = 16 + Math.max(...ticks.map((tick) => formatNumber(tick, locale).length)) * 11;
  const plotWidth = WIDTH - left - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const slot = plotWidth / Math.max(clean.length, 1);
  const barWidth = Math.min(30, slot * 0.6);
  const y = (value: number) => TOP + plotHeight - (value / max) * plotHeight;
  const x = (index: number) => left + slot * index + slot / 2;
  const isEstimated = (index: number) => estimated?.[index] === true;
  const anyEstimated = clean.some((_, index) => isEstimated(index));
  const hasPrevious = comparison.some((value) => value !== null);

  // Consecutive comparison values form one dashed line; a lone value becomes a dot.
  const segments: [number, number][][] = [];
  comparison.forEach((value, index) => {
    if (value === null) return;
    const point: [number, number] = [x(index), y(value)];
    const last = segments[segments.length - 1];
    if (last && comparison[index - 1] !== null && index > 0) last.push(point);
    else segments.push([point]);
  });

  const legend: ChartLegendItem[] = [
    ...(rangeLabel ? [{ kind: "current" as const, label: rangeLabel }] : []),
    ...(rangeLabel && hasPrevious ? [{ kind: "previous" as const, label: t.previousYear }] : []),
    ...(rangeLabel && anyEstimated ? [{ kind: "estimated" as const, label: t.estimated }] : []),
  ];

  return (
    <div className={joinClasses("kp-bar-chart", className)}>
      {legend.length > 0 && <ChartLegend items={legend} />}
      <svg
        className="kp-chart kp-bar-chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={title}
      >
        <defs>
          <pattern
            id={hatchId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect className="kp-chart-hatch-bg" width="6" height="6" />
            <line className="kp-chart-hatch" x1="0" y1="0" x2="0" y2="6" />
          </pattern>
        </defs>
        {ticks.map((tick, k) => (
          <g key={tick}>
            <line
              className={k === 0 ? "kp-chart-base" : "kp-chart-grid"}
              x1={left}
              x2={WIDTH - RIGHT}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text x={left - 8} y={y(tick) + 4} textAnchor="end">
              {formatNumber(tick, locale)}
            </text>
          </g>
        ))}
        <text x={left - 8} y={10} textAnchor="end">
          {unit}
        </text>
        {clean.map((value, index) => {
          const x0 = x(index) - barWidth / 2;
          const y0 = y(value);
          const base = y(0);
          const radius = Math.min(4, barWidth / 2, base - y0);
          const last = index === clean.length - 1;
          const comparisonValue = comparison[index];
          const hover = [
            `${labels[index] ?? ""}: ${format(value)} ${unit}`,
            comparisonValue != null
              ? ` (${t.previousYear} ${format(comparisonValue)} ${unit})`
              : "",
            isEstimated(index) ? `, ${t.estimated}` : "",
          ].join("");
          return (
            <g key={`${labels[index] ?? ""}-${index}`}>
              <title>{hover}</title>
              <rect
                className="kp-chart-hit"
                x={x(index) - slot / 2}
                y={TOP}
                width={slot}
                height={plotHeight}
              />
              {value > 0 && (
                <path
                  className={joinClasses(
                    "kp-chart-bar",
                    last && "kp-chart-bar-current",
                    isEstimated(index) && "kp-chart-bar-estimated",
                  )}
                  style={isEstimated(index) ? { fill: `url(#${hatchId})` } : undefined}
                  d={`M${x0},${base} V${y0 + radius} Q${x0},${y0} ${x0 + radius},${y0} H${x0 + barWidth - radius} Q${x0 + barWidth},${y0} ${x0 + barWidth},${y0 + radius} V${base} Z`}
                />
              )}
              <text
                className={joinClasses("kp-chart-xlabel", index % 2 === 1 && "kp-chart-xlabel-alt")}
                x={x(index)}
                y={HEIGHT - 10}
                textAnchor="middle"
              >
                {labels[index]}
              </text>
              {last && (
                <text className="kp-chart-value" x={x(index)} y={y0 - 8} textAnchor="middle">
                  {format(value)}
                </text>
              )}
            </g>
          );
        })}
        {segments.map((points) =>
          points.length > 1 ? (
            <polyline
              key={points[0]?.join()}
              className="kp-chart-previous"
              points={points.map((point) => point.join(",")).join(" ")}
            />
          ) : (
            <circle
              key={points[0]?.join()}
              className="kp-chart-previous-dot"
              cx={points[0]?.[0]}
              cy={points[0]?.[1]}
              r={3}
            />
          ),
        )}
      </svg>
      <details className="kp-chart-details">
        <summary>{t.showTable}</summary>
        <div className="kp-chart-table-scroll">
          <table className="kp-chart-table">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">{t.period}</th>
                <th scope="col" data-align="end">
                  {unit}
                </th>
                {hasPrevious && (
                  <th scope="col" data-align="end">
                    {t.previousYear}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {clean.map((value, index) => {
                const comparisonValue = comparison[index];
                return (
                  <tr
                    key={`${labels[index] ?? ""}-${index}`}
                    data-estimated={isEstimated(index) || undefined}
                  >
                    <th scope="row">{labels[index]}</th>
                    <td data-align="end">
                      {format(value)}
                      {isEstimated(index) && (
                        <span className="kp-chart-estimated-note"> ({t.estimated})</span>
                      )}
                    </td>
                    {hasPrevious && (
                      <td data-align="end">
                        {comparisonValue != null ? format(comparisonValue) : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
