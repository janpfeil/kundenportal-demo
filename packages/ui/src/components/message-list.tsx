import type { HTMLAttributes, ReactNode } from "react";
import { type CommonTexts, type Locale, commonTexts } from "../i18n/index.js";
import { type LinkComponent, joinClasses } from "./link.js";

export interface MessageListItem {
  id: string;
  /** Opens the message, e.g. "/postfach?n=<id>". */
  href: string;
  title: ReactNode;
  /** E.g. "09:14", "gestern", "28.09.". */
  time?: ReactNode;
  /** First line of the text, cut off with an ellipsis. */
  preview?: ReactNode;
  unread?: boolean | undefined;
  /** The message shown next to the list (aria-current="page"). */
  current?: boolean | undefined;
}

export interface MessageListProps extends Omit<HTMLAttributes<HTMLUListElement>, "children"> {
  items: readonly MessageListItem[];
  /** Language of the spoken "ungelesen" marker. */
  locale: Locale;
  texts?: CommonTexts["messages"] | undefined;
  linkComponent?: LinkComponent | undefined;
}

/**
 * Messages as a list of links: unread ones tinted, with a dot, bold and an "ungelesen" for
 * screen readers; the open one marked with a bar and `aria-current`.
 */
export function MessageList({
  items,
  locale,
  texts,
  linkComponent: Link = "a",
  className,
  ...rest
}: MessageListProps) {
  const t = texts ?? commonTexts[locale].messages;
  return (
    <ul className={joinClasses("kp-messages", className)} {...rest}>
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className={joinClasses("kp-message", item.unread && "kp-message-unread")}
            aria-current={item.current ? "page" : undefined}
          >
            {/* The spaces keep the parts apart in the link's accessible name; a grid
                ignores them in the layout. */}
            <span className="kp-message-dot" aria-hidden="true" />
            <span className="kp-message-title">
              {item.unread && <span className="kp-sr-only">{t.unread}:</span>} {item.title}
            </span>{" "}
            {item.time !== undefined && <span className="kp-message-time">{item.time}</span>}{" "}
            {item.preview !== undefined && (
              <span className="kp-message-preview">{item.preview}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
