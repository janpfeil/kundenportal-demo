import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from "react";

interface FieldFrameProps {
  /** Visible label; it is the field's accessible name. */
  label: ReactNode;
  /** Help text below the label, linked via aria-describedby. */
  hint?: ReactNode;
  /** Validation message; marks the field invalid. */
  error?: ReactNode;
}

function useFieldIds(id: string | undefined) {
  const generated = useId();
  const fieldId = id ?? generated;
  return { fieldId, hintId: `${fieldId}-hint`, errorId: `${fieldId}-error` };
}

function describedBy(
  ids: { hintId: string; errorId: string },
  hint: ReactNode,
  error: ReactNode,
  own: string | undefined,
): string | undefined {
  const parts = [own, hint !== undefined && ids.hintId, error !== undefined && ids.errorId];
  const joined = parts.filter(Boolean).join(" ");
  return joined || undefined;
}

function Frame({
  fieldId,
  hintId,
  errorId,
  label,
  hint,
  error,
  children,
}: FieldFrameProps & { fieldId: string; hintId: string; errorId: string; children: ReactNode }) {
  return (
    <div className="kp-field">
      <label className="kp-label" htmlFor={fieldId}>
        {label}
      </label>
      {hint !== undefined && (
        <span className="kp-hint" id={hintId}>
          {hint}
        </span>
      )}
      {children}
      {error !== undefined && (
        <span className="kp-error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}

export interface TextFieldProps
  extends FieldFrameProps, Omit<InputHTMLAttributes<HTMLInputElement>, "children"> {
  type?: "text" | "email" | "tel" | "password" | "search" | "url" | "date";
}

export function TextField({
  label,
  hint,
  error,
  id,
  type = "text",
  className,
  "aria-describedby": ownDescribedBy,
  ...rest
}: TextFieldProps) {
  const ids = useFieldIds(id);
  return (
    <Frame {...ids} label={label} hint={hint} error={error}>
      <input
        id={ids.fieldId}
        type={type}
        className={className ? `kp-input ${className}` : "kp-input"}
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={describedBy(ids, hint, error, ownDescribedBy)}
        {...rest}
      />
    </Frame>
  );
}

export interface NumberFieldProps
  extends FieldFrameProps, Omit<InputHTMLAttributes<HTMLInputElement>, "children" | "type"> {
  /** Unit shown after the field, e.g. "kWh"; also read out after the value. */
  unit?: string;
}

export function NumberField({
  label,
  hint,
  error,
  id,
  unit,
  className,
  inputMode = "decimal",
  "aria-describedby": ownDescribedBy,
  ...rest
}: NumberFieldProps) {
  const ids = useFieldIds(id);
  const unitId = `${ids.fieldId}-unit`;
  const describedByUnit = describedBy(
    ids,
    hint,
    error,
    [ownDescribedBy, unit !== undefined && unitId].filter(Boolean).join(" ") || undefined,
  );
  return (
    <Frame {...ids} label={label} hint={hint} error={error}>
      <div className="kp-input-row">
        <input
          id={ids.fieldId}
          type="number"
          inputMode={inputMode}
          className={className ? `kp-input ${className}` : "kp-input"}
          aria-invalid={error !== undefined ? true : undefined}
          aria-describedby={describedByUnit}
          {...rest}
        />
        {unit !== undefined && (
          <span className="kp-unit" id={unitId}>
            {unit}
          </span>
        )}
      </div>
    </Frame>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends FieldFrameProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: readonly SelectOption[];
  /** Optional first entry without a value, e.g. "Bitte wählen". */
  placeholder?: string;
}

export function Select({
  label,
  hint,
  error,
  id,
  options,
  placeholder,
  className,
  "aria-describedby": ownDescribedBy,
  ...rest
}: SelectProps) {
  const ids = useFieldIds(id);
  return (
    <Frame {...ids} label={label} hint={hint} error={error}>
      <select
        id={ids.fieldId}
        className={className ? `kp-input ${className}` : "kp-input"}
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={describedBy(ids, hint, error, ownDescribedBy)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </Frame>
  );
}
