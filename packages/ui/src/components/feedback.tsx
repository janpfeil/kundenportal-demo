import type { HTMLAttributes, ReactNode } from "react";
import { joinClasses } from "./link.js";

export type Tone = "info" | "success" | "warning" | "error";

export interface NoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "role"> {
  tone?: Tone;
  /** Bold first line. */
  title?: ReactNode;
  children: ReactNode;
}

/**
 * A message box. Info and success are polite live regions (role="status"); warnings and
 * errors interrupt (role="alert").
 */
export function Notice({ tone = "info", title, className, children, ...rest }: NoticeProps) {
  return (
    <div
      role={tone === "warning" || tone === "error" ? "alert" : "status"}
      className={joinClasses("kp-notice", `kp-notice-${tone}`, className)}
      {...rest}
    >
      {title !== undefined && <p className="kp-notice-title">{title}</p>}
      {typeof children === "string" ? <p>{children}</p> : children}
    </div>
  );
}

export interface BadgeProps {
  tone?: "accent" | "neutral" | "success" | "warning" | "error";
  children: ReactNode;
}

/** A short inline marker such as "neu"; the text carries the meaning, not the colour. */
export function Badge({ tone = "accent", children }: BadgeProps) {
  return (
    <span className={joinClasses("kp-badge", tone !== "accent" && `kp-badge-${tone}`)}>
      {children}
    </span>
  );
}

export interface EmptyStateProps {
  title?: ReactNode;
  children?: ReactNode;
  /** A button or link that helps to get started. */
  action?: ReactNode;
  headingLevel?: 2 | 3;
}

export function EmptyState({ title, children, action, headingLevel = 2 }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className="kp-empty">
      {title !== undefined && <Heading className="kp-empty-title">{title}</Heading>}
      {children !== undefined && <p>{children}</p>}
      {action}
    </div>
  );
}
