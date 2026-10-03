import { type ReactNode, useId } from "react";
import { joinClasses } from "./link.js";

export interface OptionCard {
  value: string;
  /** Name of the option, shown in bold; it starts the radio's accessible name. */
  label: ReactNode;
  /** Price line below the name, e.g. "12,00 € Grundpreis / Monat". */
  price?: ReactNode;
  /** Further lines below the price (unit prices, "Aktuell"), each on a line of its own. */
  description?: ReactNode | readonly ReactNode[];
  disabled?: boolean;
}

export interface OptionCardsProps {
  /** Visible legend; it names the radio group. */
  legend: ReactNode;
  /** `name` of the radio inputs; one group per name. */
  name: string;
  options: readonly OptionCard[];
  /** Value of the checked option; no card is checked when it matches none. */
  value: string | undefined;
  onChange: (value: string) => void;
  /** Validation message below the cards, linked to the group via aria-describedby. */
  error?: ReactNode;
  /** Id of the group; the error gets `${id}-error`. Generated when left out. */
  id?: string;
  className?: string;
}

function linesOf(description: OptionCard["description"]): readonly ReactNode[] {
  if (description === undefined) return [];
  return Array.isArray(description) ? (description as readonly ReactNode[]) : [description];
}

/**
 * A radio group whose options are selectable cards (tariff options with their prices).
 * The radios stay native inputs inside the card's label: arrow keys move the choice, Tab
 * leaves the group, and the card's text is the radio's accessible name.
 */
export function OptionCards({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  id,
  className,
}: OptionCardsProps) {
  const generated = useId();
  const groupId = id ?? generated;
  const errorId = `${groupId}-error`;
  return (
    <fieldset
      id={groupId}
      className={joinClasses("kp-optcards", className)}
      aria-describedby={error !== undefined ? errorId : undefined}
    >
      <legend>{legend}</legend>
      {options.map((option) => {
        const lines = linesOf(option.description);
        return (
          <label key={option.value} className="kp-optcard">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <b>{option.label}</b>
            {option.price !== undefined && <small>{option.price}</small>}
            {lines.map((line, index) => (
              <small key={index}>{line}</small>
            ))}
          </label>
        );
      })}
      {error !== undefined && (
        <span className="kp-error" id={errorId}>
          {error}
        </span>
      )}
    </fieldset>
  );
}
