import type { ReactNode } from "react";
import { joinClasses } from "./link.js";

export interface PageProps {
  /** Page heading (the only h1). */
  title: ReactNode;
  /** Introductory paragraph below the heading. */
  lead?: ReactNode;
  /** Buttons or links shown below the lead. */
  actions?: ReactNode;
  /** "hero" enlarges the heading for start pages. */
  variant?: "default" | "hero";
  children?: ReactNode;
}

export function Page({ title, lead, actions, variant = "default", children }: PageProps) {
  return (
    <section className={joinClasses("kp-page", variant === "hero" && "kp-page-hero")}>
      <h1>{title}</h1>
      {lead !== undefined && <p className="kp-lead">{lead}</p>}
      {actions !== undefined && <div className="kp-page-actions">{actions}</div>}
      {children}
    </section>
  );
}

export interface CardProps {
  /** Visible heading of the card. */
  title?: ReactNode;
  /** Heading level of the title (default 2). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}

export function Card({ title, headingLevel = 2, className, children }: CardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={joinClasses("kp-card", className)}>
      {title !== undefined && <Heading className="kp-card-title">{title}</Heading>}
      {children}
    </div>
  );
}
