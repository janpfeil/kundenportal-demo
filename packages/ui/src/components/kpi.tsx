import type { HTMLAttributes, ReactNode } from "react";
import { joinClasses } from "./link.js";

export interface KpiDelta {
  /** E.g. "+126 heute", "−4,1 % zum Vorjahr"; the text carries the direction. */
  text: ReactNode;
  /** Whether the change is welcome (green), unwelcome (red) or neither (muted). */
  tone?: "good" | "bad" | "neutral" | undefined;
}

export interface KpiProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** What the number counts, e.g. "Offene Klärfälle". */
  label: ReactNode;
  /** The big number, already formatted, e.g. "1.842" or "48.213 kWh". */
  value: ReactNode;
  /** Small muted part after the value, e.g. "/ 2.400". */
  of?: ReactNode;
  delta?: KpiDelta | undefined;
  /** Small muted line, e.g. "am 01.10.2026 · Ihre Angabe". */
  hint?: ReactNode;
  /** Right side of the delta row, e.g. a Sparkline. */
  aside?: ReactNode;
  /** A ProgressRing left of the texts (the cockpit's progress tiles). */
  ring?: ReactNode;
  /** Below the texts, e.g. a thin Meter. */
  children?: ReactNode;
}

/**
 * A key figure tile (Kennzahl): label, big value, optional change, hint, trend line or ring.
 * With `aria-label` it is a named section, so screen readers can jump between the tiles.
 */
export function Kpi({
  label,
  value,
  of,
  delta,
  hint,
  aside,
  ring,
  children,
  className,
  ...rest
}: KpiProps) {
  const Element = rest["aria-label"] || rest["aria-labelledby"] ? "section" : "div";
  const row = delta !== undefined || aside !== undefined;
  return (
    <Element
      className={joinClasses("kp-card", "kp-kpi", ring !== undefined && "kp-kpi-ring", className)}
      {...rest}
    >
      {ring !== undefined && <div className="kp-kpi-ring-slot">{ring}</div>}
      <div className="kp-kpi-body">
        <span className="kp-kpi-label">{label}</span>
        <span className="kp-kpi-value">
          {value}
          {of !== undefined && <span className="kp-kpi-of"> {of}</span>}
        </span>
        {row && (
          <div className="kp-kpi-row">
            {delta !== undefined && (
              <span className={`kp-kpi-delta kp-kpi-delta-${delta.tone ?? "neutral"}`}>
                {delta.text}
              </span>
            )}
            {aside}
          </div>
        )}
        {hint !== undefined && <span className="kp-kpi-hint">{hint}</span>}
        {children}
      </div>
    </Element>
  );
}

export interface KpiGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Key figure tiles in a row: four columns, two below 1080 px, one on phones. */
export function KpiGrid({ className, ...rest }: KpiGridProps) {
  return <div className={joinClasses("kp-kpis", className)} {...rest} />;
}
