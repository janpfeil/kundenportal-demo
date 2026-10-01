import type { HTMLAttributes } from "react";
import { joinClasses } from "./link.js";

export interface ProgressRingProps {
  /** Current value, e.g. migrated accounts. Clamped to 0…max for the arc. */
  value: number;
  max: number;
  /** Width and height in px (default 84). */
  size?: number | undefined;
  /** Accessible name with the numbers, e.g. "Versorger: 1.842 von 2.400 übernommen (77 %)". */
  label: string;
  /** Large text in the middle, e.g. "77 %". */
  center: string;
  /** Small muted text below the centre, e.g. "von 48 Std.". */
  sub?: string | undefined;
  className?: string | undefined;
}

/** A circular gauge with a text in the middle; one image for screen readers (`label`). */
export function ProgressRing({
  value,
  max,
  size = 84,
  label,
  center,
  sub,
  className,
}: ProgressRingProps) {
  const stroke = Math.min(9, size / 6);
  const radius = size / 2 - stroke / 2 - 2.5;
  const circumference = 2 * Math.PI * radius;
  const share = max > 0 && Number.isFinite(value) ? Math.min(Math.max(value / max, 0), 1) : 0;
  const middle = size / 2;
  return (
    <svg
      className={joinClasses("kp-ring", className)}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
    >
      <circle
        className="kp-ring-track"
        cx={middle}
        cy={middle}
        r={radius}
        fill="none"
        strokeWidth={stroke}
      />
      {share > 0 && (
        <circle
          className="kp-ring-value"
          cx={middle}
          cy={middle}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * share} ${circumference}`}
          transform={`rotate(-90 ${middle} ${middle})`}
        />
      )}
      <text
        className="kp-ring-center"
        x="50%"
        y={sub ? "47%" : "53%"}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size / 5.2}
      >
        {center}
      </text>
      {sub && (
        <text className="kp-ring-sub" x="50%" y="66%" textAnchor="middle" fontSize={size / 10}>
          {sub}
        </text>
      )}
    </svg>
  );
}

export interface SparklineProps {
  values: readonly number[];
  /** Width and height in px (default 120 × 34). */
  width?: number | undefined;
  height?: number | undefined;
  /**
   * Accessible name, e.g. "Offene Klärfälle der letzten 7 Tage: 6 bis 14". Without it the
   * line is decorative (`aria-hidden`): the number next to it says what matters.
   */
  label?: string | undefined;
  className?: string | undefined;
}

/**
 * A small trend line with a shaded area and a dot on the latest value. Copes with no value,
 * a single value and flat series (drawn in the middle) without producing NaN coordinates.
 */
export function Sparkline({ values, width = 120, height = 34, label, className }: SparklineProps) {
  const points = values.filter((value) => Number.isFinite(value));
  const top = Math.max(...points);
  const bottom = Math.min(...points);
  const span = top - bottom;
  const x = (index: number) =>
    points.length > 1 ? 3 + (index * (width - 6)) / (points.length - 1) : width / 2;
  const y = (value: number) =>
    span > 0 ? height - 4 - ((value - bottom) / span) * (height - 8) : height / 2;
  const coordinates = points.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const last = points.length - 1;
  const lastValue = points[last];
  return (
    <svg
      className={joinClasses("kp-chart", "kp-sparkline", className)}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {points.length > 1 && (
        <>
          <polygon
            className="kp-chart-area"
            points={`${x(0)},${height} ${coordinates} ${x(last)},${height}`}
          />
          <polyline className="kp-chart-line" points={coordinates} />
        </>
      )}
      {lastValue !== undefined && (
        <circle className="kp-chart-dot" cx={x(last)} cy={y(lastValue)} r={4} />
      )}
    </svg>
  );
}

export interface MiniBar {
  /** Short visible name, e.g. "API", "Ev.", "Up."; also the meter's accessible name. */
  label: string;
  /** Used share in percent; may exceed 100 when a quota is overdrawn. */
  percent: number;
  /** Spoken value; defaults to "<percent> %". */
  valueText?: string | undefined;
}

export interface MiniBarsProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  items: readonly MiniBar[];
}

/**
 * Small labelled quota bars side by side, as in the pass table: warning from 80 %, error
 * from 100 %. Each bar is a meter (`role="meter"`) named by its label.
 */
export function MiniBars({ items, className, ...rest }: MiniBarsProps) {
  return (
    <div className={joinClasses("kp-minibars", className)} {...rest}>
      {items.map((item) => {
        const used = Number.isFinite(item.percent) ? Math.max(0, Math.round(item.percent)) : 0;
        const shown = Math.min(used, 100);
        const tone = used >= 100 ? "error" : used >= 80 ? "warning" : "ok";
        return (
          <span className="kp-minibar" key={item.label}>
            <span aria-hidden="true">
              {item.label} {used}
            </span>
            <span
              role="meter"
              aria-label={item.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={shown}
              aria-valuetext={item.valueText ?? `${used} %`}
              className={joinClasses("kp-minibar-track", `kp-minibar-${tone}`)}
            >
              <span className="kp-minibar-bar" style={{ width: `${shown}%` }} />
            </span>
          </span>
        );
      })}
    </div>
  );
}
