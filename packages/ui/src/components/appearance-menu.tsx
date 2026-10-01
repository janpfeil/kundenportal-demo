"use client";

import { useState } from "react";
import type { CommonTexts } from "../i18n/index.js";
import { type ThemeChoice, applyTheme, currentTheme } from "../theme-runtime.js";
import { type Audience, COLOR_MODES, THEME_PRESETS } from "../themes.js";
import { useMenu } from "./use-menu.js";

export interface AppearanceSettings {
  /** Whose presets the switcher offers; must match `data-audience` on <html>. */
  audience: Audience;
  texts: CommonTexts["appearance"];
}

/**
 * The "Darstellung" section of a menu: the presets of the audience and the colour mode, each
 * a group of `menuitemradio` entries. Choosing one applies it at once and stores it in the
 * cookies (applyTheme); the menu stays open so both can be chosen in one go.
 */
export function AppearanceItems({ audience, texts }: AppearanceSettings) {
  // Rendered only while the menu is open, i.e. in the browser: read what <html> shows now.
  const [choice, setChoice] = useState<ThemeChoice>(() => currentTheme());
  const choose = (change: Partial<ThemeChoice>) => setChoice(applyTheme(change));
  const radio = (checked: boolean, label: string, onSelect: () => void, testId: string) => (
    <li role="presentation" key={testId}>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={checked}
        tabIndex={-1}
        className="kp-menu-radio"
        data-testid={testId}
        onClick={onSelect}
      >
        {label}
      </button>
    </li>
  );
  return (
    <>
      {/* Visual heading; the groups carry the accessible names. */}
      <li role="presentation" className="kp-menu-heading" aria-hidden="true">
        {texts.label}
      </li>
      <li role="presentation">
        <ul role="group" aria-label={`${texts.label}: ${texts.preset}`} className="kp-menu-group">
          {THEME_PRESETS[audience].map((preset) =>
            radio(
              choice.preset === preset,
              texts.presets[preset],
              () => choose({ preset }),
              `theme-preset-${preset}`,
            ),
          )}
        </ul>
      </li>
      <li role="separator" className="kp-user-separator" />
      <li role="presentation">
        <ul
          role="group"
          aria-label={`${texts.label}: ${texts.colorMode}`}
          className="kp-menu-group kp-menu-modes"
        >
          {COLOR_MODES.map((mode) =>
            radio(
              choice.mode === mode,
              texts.modes[mode],
              () => choose({ mode }),
              `color-mode-${mode}`,
            ),
          )}
        </ul>
      </li>
    </>
  );
}

/**
 * Appearance switch for visitors who are not signed in (no user menu): a small menu button
 * next to the language link with the same entries as the user menu's "Darstellung".
 */
export function AppearanceMenu(settings: AppearanceSettings) {
  const { open, root, menuId, onMenuKey, buttonProps } = useMenu();
  return (
    <div className="kp-user-menu" ref={root} data-testid="appearance-menu">
      <button {...buttonProps} className="kp-appearance-button" aria-label={settings.texts.label}>
        <span className="kp-appearance-icon" aria-hidden="true">
          ◐
        </span>
        <span className="kp-appearance-label">{settings.texts.label}</span>
      </button>
      {open && (
        <ul id={menuId} role="menu" className="kp-user-popup" onKeyDown={onMenuKey}>
          <AppearanceItems {...settings} />
        </ul>
      )}
    </div>
  );
}
