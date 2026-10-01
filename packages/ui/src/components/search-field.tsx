"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./icon.js";
import { hasModifier, isTypingTarget } from "./keys.js";
import { joinClasses } from "./link.js";

export interface SearchFieldProps {
  /** Page that shows the results; the form sends a GET request there. */
  action: string;
  /** Name of the query parameter (default "q"). */
  name?: string | undefined;
  defaultValue?: string | undefined;
  /** E.g. "Konto, Mandant, Ereignis …". */
  placeholder?: string | undefined;
  /** Accessible name of field and search landmark (visually hidden), e.g. "Konto, Mandant oder Ereignis suchen". */
  label: string;
  /** Key that focuses the field from anywhere on the page (default "/"); `false` for none. */
  kbd?: string | false | undefined;
  className?: string | undefined;
}

/**
 * The search field of the top bar: a GET form with a search icon and the key hint "/".
 * Pressing that key anywhere outside a text field focuses the field.
 */
export function SearchField({
  action,
  name = "q",
  defaultValue,
  placeholder,
  label,
  kbd = "/",
  className,
}: SearchFieldProps) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (kbd === false) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== kbd || event.defaultPrevented || hasModifier(event)) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [kbd]);

  return (
    <form
      role="search"
      aria-label={label}
      action={action}
      method="get"
      className={joinClasses("kp-search-form", className)}
    >
      <label className="kp-search">
        <Icon name="search" />
        <span className="kp-sr-only">{label}</span>
        <input
          ref={input}
          type="search"
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          enterKeyHint="search"
          aria-keyshortcuts={kbd === false ? undefined : kbd}
        />
        {kbd !== false && (
          <kbd className="kp-kbd" aria-hidden="true">
            {kbd}
          </kbd>
        )}
      </label>
    </form>
  );
}
