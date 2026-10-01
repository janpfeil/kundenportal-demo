import type { HTMLAttributes, ReactNode } from "react";
import { IconCircle, type IconName } from "./icon.js";
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

export interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Icon on a tinted tile left of the text. */
  icon?: IconName | undefined;
  title: ReactNode;
  /** Heading level of the title (default 2). */
  headingLevel?: 2 | 3 | 4 | undefined;
  /** The explanation below the title. */
  children?: ReactNode;
  /** A button or link on the right, e.g. "Jetzt erfassen"; full width on phones. */
  action?: ReactNode;
}

/**
 * A to-do note on a page, e.g. "Zählerstand Strom fällig": a card with an accent bar on the
 * left, icon, title, short text and one action.
 */
export function Banner({
  icon,
  title,
  headingLevel = 2,
  children,
  action,
  className,
  ...rest
}: BannerProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={joinClasses("kp-card", "kp-banner", className)} {...rest}>
      {icon !== undefined && <IconCircle name={icon} />}
      <div className="kp-banner-body">
        <Heading className="kp-banner-title">{title}</Heading>
        {typeof children === "string" ? <p className="kp-muted">{children}</p> : children}
      </div>
      {action !== undefined && <div className="kp-banner-action">{action}</div>}
    </div>
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
