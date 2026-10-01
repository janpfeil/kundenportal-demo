import type { OlHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icon.js";
import { joinClasses } from "./link.js";

export interface TimelineItem {
  /** React key, e.g. the event id. */
  id: string;
  icon: IconName;
  /** Colour of the icon dot; the title carries the meaning. */
  tone?: "ok" | "warn" | "err" | "neutral" | undefined;
  /** What happened, in words, e.g. "Konto übernommen". */
  title: ReactNode;
  /** Technical name in monospace, e.g. "AccountMigrated". */
  code?: string | undefined;
  /** Further details, e.g. account numbers or the person who acted. */
  meta?: readonly ReactNode[] | undefined;
  /** When, e.g. <time dateTime="…">10:41</time>. */
  time?: ReactNode;
}

export interface TimelineProps extends Omit<OlHTMLAttributes<HTMLOListElement>, "children"> {
  items: readonly TimelineItem[];
}

/** Events in order, newest first, each with an icon dot on a vertical line. */
export function Timeline({ items, className, ...rest }: TimelineProps) {
  return (
    <ol className={joinClasses("kp-timeline", className)} {...rest}>
      {items.map((item) => (
        <li key={item.id}>
          <span className={`kp-timeline-icon kp-timeline-${item.tone ?? "neutral"}`}>
            <Icon name={item.icon} />
          </span>
          <div>
            <div className="kp-timeline-title">{item.title}</div>
            <div className="kp-timeline-meta">
              {item.code !== undefined && <span className="kp-mono">{item.code}</span>}
              {item.meta?.map((entry, index) => (
                <span key={index}>{entry}</span>
              ))}
              {item.time !== undefined && <span>{item.time}</span>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
