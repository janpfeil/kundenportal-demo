import { type HTMLAttributes, type ReactNode, useId } from "react";
import { Icon, type IconName } from "./icon.js";
import { joinClasses } from "./link.js";

export interface PageProps {
  /** Page heading (the only h1). */
  title: ReactNode;
  /** Small accent line above the heading, e.g. "Migration" or today's date. */
  eyebrow?: ReactNode;
  /** Right of the heading, e.g. a LiveIndicator and a refresh button. */
  aside?: ReactNode;
  /** Introductory paragraph below the heading. */
  lead?: ReactNode;
  /** Buttons or links shown below the lead. */
  actions?: ReactNode;
  /** "hero" enlarges the heading for start pages. */
  variant?: "default" | "hero";
  children?: ReactNode;
}

export function Page({
  title,
  eyebrow,
  aside,
  lead,
  actions,
  variant = "default",
  children,
}: PageProps) {
  const heading =
    eyebrow === undefined && aside === undefined ? (
      <h1>{title}</h1>
    ) : (
      <div className="kp-page-head">
        <div className="kp-page-heading">
          {eyebrow !== undefined && <p className="kp-eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
        </div>
        {aside !== undefined && <div className="kp-page-aside">{aside}</div>}
      </div>
    );
  return (
    <section className={joinClasses("kp-page", variant === "hero" && "kp-page-hero")}>
      {heading}
      {lead !== undefined && <p className="kp-lead">{lead}</p>}
      {actions !== undefined && <div className="kp-page-actions">{actions}</div>}
      {children}
    </section>
  );
}

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Visible heading of the card. */
  title?: ReactNode;
  /** Heading level of the title (default 2). */
  headingLevel?: 2 | 3 | 4;
  /** Icon before the title. */
  icon?: IconName | undefined;
  /** Right side of the heading row, e.g. "Alle anzeigen", a count badge or buttons. */
  actions?: ReactNode;
  /** "danger" draws a red border, e.g. around "Demo zurücksetzen". */
  tone?: "default" | "danger" | undefined;
  /**
   * Element of the card (default div). A section or article is a named region: by
   * `aria-label`/`aria-labelledby` if given, else by its title.
   */
  as?: "div" | "section" | "article" | undefined;
  className?: string | undefined;
  children: ReactNode;
}

export function Card({
  title,
  headingLevel = 2,
  icon,
  actions,
  tone = "default",
  as: Element = "div",
  className,
  children,
  ...rest
}: CardProps) {
  const Heading = `h${headingLevel}` as const;
  const headingId = useId();
  const named = Element !== "div" && title !== undefined;
  const labelledBy =
    named && !rest["aria-label"] && !rest["aria-labelledby"] ? headingId : undefined;
  const heading = title !== undefined && (
    <Heading className="kp-card-title" id={labelledBy}>
      {icon !== undefined && <Icon name={icon} />}
      {title}
    </Heading>
  );
  return (
    <Element
      className={joinClasses("kp-card", tone === "danger" && "kp-card-danger", className)}
      aria-labelledby={labelledBy}
      {...rest}
    >
      {actions !== undefined || icon !== undefined ? (
        <div className="kp-card-head">
          {heading}
          {actions !== undefined && <div className="kp-card-actions">{actions}</div>}
        </div>
      ) : (
        heading
      )}
      {children}
    </Element>
  );
}
