/**
 * Whether a key press belongs to text input (a field, a select, an editable region), where
 * single-key shortcuts such as "/" or "g c" must not fire.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest("[contenteditable]:not([contenteditable=false])"))
    return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Whether the key press carries a modifier, i.e. is meant for the browser or the system. */
export function hasModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}
