import type { HTMLAttributes, ReactNode } from "react";
import { type CommonTexts, type Locale, commonTexts } from "../i18n/index.js";
import { joinClasses } from "./link.js";

export type StatusTone = "ok" | "warn" | "err" | "info" | "neutral";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Colour of pill and dot; the text carries the meaning, the colour only repeats it. */
  tone?: StatusTone | undefined;
  /** A halo around the dot for running states such as "läuft" or "Aktiv". */
  pulse?: boolean | undefined;
  children: ReactNode;
}

/** A status pill with a dot, e.g. "aktiv", "läuft", "Kontingent erschöpft". */
export function StatusBadge({
  tone = "neutral",
  pulse = false,
  className,
  children,
  ...rest
}: StatusBadgeProps) {
  return (
    <span
      className={joinClasses(
        "kp-status",
        `kp-status-${tone}`,
        pulse && "kp-status-pulse",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export interface FakeMarkerProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Language of the marker's texts. */
  locale: Locale;
  /** Overrides the shared texts ("Demo-Wert", "simuliert — noch nicht aus dem System"). */
  texts?: CommonTexts["fake"] | undefined;
}

/**
 * The uniform marker of simulated values (see docs/wiki/design.md, "Gefakte Elemente"): a
 * small badge "Demo-Wert" with the explanation as tooltip and, for screen readers, as text.
 * `data-fake="true"` lets tests and tools find every simulated value.
 */
export function FakeMarker({ locale, texts, className, ...rest }: FakeMarkerProps) {
  const t = texts ?? commonTexts[locale].fake;
  return (
    <span
      className={joinClasses("kp-fake", className)}
      data-fake="true"
      title={t.description}
      {...rest}
    >
      {t.label}
      <span className="kp-sr-only"> ({t.description})</span>
    </span>
  );
}

export interface LiveIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  /** E.g. "Aktualisiert sich alle 10 Sekunden · 10:42:18". */
  children: ReactNode;
}

/** A green dot with a note that the page refreshes itself, e.g. in the cockpit's header. */
export function LiveIndicator({ className, children, ...rest }: LiveIndicatorProps) {
  return (
    <span className={joinClasses("kp-live", className)} {...rest}>
      {children}
    </span>
  );
}

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/** A key or key sequence as the user types it, e.g. "/" or "g c". */
export function Kbd({ className, children, ...rest }: KbdProps) {
  return (
    <kbd className={joinClasses("kp-kbd", className)} {...rest}>
      {children}
    </kbd>
  );
}
