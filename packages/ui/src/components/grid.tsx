import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { joinClasses } from "./link.js";

interface LayoutProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface GridProps extends LayoutProps {
  /** Smallest column width before the grid wraps, a CSS length (default "240px"). */
  min?: string | undefined;
}

/** As many equal columns as fit, each at least `min` wide (cards, contract tiles). */
export function Grid({ min, className, style, ...rest }: GridProps) {
  return (
    <div
      className={joinClasses("kp-grid", className)}
      style={min ? ({ ...style, "--kp-grid-min": min } as CSSProperties) : style}
      {...rest}
    />
  );
}

/** Main column and side column (1.6 : 1); one column from 860 px down. */
export function Split({ className, ...rest }: LayoutProps) {
  return <div className={joinClasses("kp-split", className)} {...rest} />;
}

/** The cockpit's two columns: wide main column, side column of at least 300 px; one below 1080 px. */
export function CockpitGrid({ className, ...rest }: LayoutProps) {
  return <div className={joinClasses("kp-cockpit-grid", className)} {...rest} />;
}

export interface StackProps extends LayoutProps {
  /** Spacing between the children: one or 1.75 times the theme's space. */
  gap?: "default" | "large" | undefined;
}

/** Children below each other with even spacing. */
export function Stack({ gap = "default", className, ...rest }: StackProps) {
  return (
    <div
      className={joinClasses("kp-stack", gap === "large" && "kp-stack-large", className)}
      {...rest}
    />
  );
}
