import { type HTMLAttributes, type ReactNode, useId } from "react";
import { joinClasses } from "./link.js";

export interface MeterProps extends Omit<HTMLAttributes<HTMLDivElement>, "role" | "children"> {
  /** Visible name of the gauge, e.g. "API-Aufrufe". */
  label: ReactNode;
  /** Current value, e.g. used calls. Clamped to 0…max for the bar. */
  value: number;
  max: number;
  /**
   * Visible and spoken value, e.g. "4.200 von 5.000 übrig". Without it, screen readers
   * announce the raw number.
   */
  valueText?: string;
  /**
   * Share of `max` from which the bar shows a warning (default 0.8); at `max` it shows an
   * error. The text carries the meaning; the colour only repeats it.
   */
  warnAt?: number;
}

/**
 * A horizontal gauge for a bounded quantity such as a used quota. Uses `role="meter"`
 * (nothing is loading, so no progress bar) with the value text as its spoken value.
 */
export function Meter({
  label,
  value,
  max,
  valueText,
  warnAt = 0.8,
  className,
  ...rest
}: MeterProps) {
  const labelId = useId();
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const share = clamped / safeMax;
  const tone = share >= 1 ? "error" : share >= warnAt ? "warning" : "ok";
  return (
    <div className={joinClasses("kp-meter", `kp-meter-${tone}`, className)} {...rest}>
      <div className="kp-meter-head">
        <span id={labelId} className="kp-meter-label">
          {label}
        </span>
        {valueText !== undefined && <span className="kp-meter-value">{valueText}</span>}
      </div>
      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        aria-valuetext={valueText}
        className="kp-meter-track"
      >
        <div className="kp-meter-bar" style={{ width: `${Math.round(share * 1000) / 10}%` }} />
      </div>
    </div>
  );
}
