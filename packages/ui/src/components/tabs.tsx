"use client";

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";
import { Icon, type IconName } from "./icon.js";
import { joinClasses } from "./link.js";

export interface TabItem {
  /** Stable key, e.g. the contract id; also selects the tab via `defaultTab`. */
  id: string;
  label: ReactNode;
  icon?: IconName | undefined;
  /** Content of the tab; may be rendered on the server and passed in as nodes. */
  panel: ReactNode;
}

export interface TabsProps {
  items: readonly TabItem[];
  /** Accessible name of the tab list, e.g. "Verträge". */
  label: string;
  /** Tab shown first (default: the first). */
  defaultTab?: string | undefined;
  /** Called with the id of the newly selected tab. */
  onChange?: ((id: string) => void) | undefined;
  className?: string | undefined;
}

/**
 * Tabs after the WAI-ARIA pattern: arrow keys move between the tabs and select them, Home
 * and End jump to the first and last, only the selected tab is in the tab order. All panels
 * are in the markup; the others are hidden.
 */
export function Tabs({ items, label, defaultTab, onChange, className }: TabsProps) {
  const base = useId();
  const first = items.find((item) => item.id === defaultTab)?.id ?? items[0]?.id;
  const [selected, setSelected] = useState(first);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = items.some((item) => item.id === selected) ? selected : first;

  const select = (index: number) => {
    const item = items[index];
    if (!item) return;
    setSelected(item.id);
    tabs.current[index]?.focus();
    if (item.id !== current) onChange?.(item.id);
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const target =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  };

  return (
    <div className={joinClasses("kp-tabs", className)}>
      <div role="tablist" aria-label={label} className="kp-tablist">
        {items.map((item, index) => {
          const active = item.id === current;
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-controls={`${base}-panel-${item.id}`}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className="kp-tab"
              onClick={() => select(index)}
              onKeyDown={(event) => onKey(event, index)}
            >
              {item.icon && <Icon name={item.icon} />}
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          tabIndex={0}
          hidden={item.id !== current}
          className="kp-tabpanel"
        >
          {item.panel}
        </div>
      ))}
    </div>
  );
}
