"use client";

import { useEffect } from "react";
import { hasModifier, isTypingTarget } from "./keys.js";

export interface Shortcut {
  /** Keys pressed one after the other, separated by spaces, e.g. "g c" or "?". */
  keys: string;
  /** Where the shortcut leads. */
  href: string;
}

export interface KeyboardShortcutsProps {
  shortcuts: readonly Shortcut[];
  /** How long the next key of a sequence may take, in ms (default 1000). */
  timeout?: number | undefined;
  /** Navigation; defaults to a full page load (`window.location.assign`), as zones need. */
  navigate?: ((href: string) => void) | undefined;
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

// Module-level, so the listener is not re-registered (and a half-typed sequence lost) on render.
const assign = (href: string) => window.location.assign(href);

/**
 * Key sequences that lead to pages, e.g. "g c" → cockpit, "g p" → passes (as in the
 * sidebar's hints). Ignored while the visitor types in a field and whenever a modifier key
 * (Ctrl, Alt, Cmd) is held, so browser and screen reader shortcuts keep working. Renders
 * nothing.
 */
export function KeyboardShortcuts({
  shortcuts,
  timeout = 1000,
  navigate = assign,
}: KeyboardShortcutsProps) {
  // Compared by value: a parent's new array literal must not drop a half-typed sequence.
  const spec = JSON.stringify(shortcuts);
  useEffect(() => {
    const sequences = (JSON.parse(spec) as Shortcut[]).map((shortcut) => ({
      keys: shortcut.keys.trim().split(/\s+/),
      href: shortcut.href,
    }));
    const startsWith = (keys: string[], pressed: string[]) =>
      pressed.length <= keys.length && pressed.every((key, index) => keys[index] === key);
    let pressed: string[] = [];
    let last = 0;

    const onKey = (event: KeyboardEvent) => {
      if (MODIFIER_KEYS.has(event.key)) return;
      if (event.defaultPrevented || event.repeat || hasModifier(event)) return;
      if (isTypingTarget(event.target)) {
        pressed = [];
        return;
      }
      const now = Date.now();
      if (now - last > timeout) pressed = [];
      last = now;
      pressed = [...pressed, event.key];
      // A key that continues no sequence may start a new one.
      if (!sequences.some((sequence) => startsWith(sequence.keys, pressed)))
        pressed = sequences.some((sequence) => sequence.keys[0] === event.key) ? [event.key] : [];
      const match = sequences.find(
        (sequence) => sequence.keys.length === pressed.length && startsWith(sequence.keys, pressed),
      );
      if (match) {
        pressed = [];
        event.preventDefault();
        navigate(match.href);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [spec, timeout, navigate]);
  return null;
}
