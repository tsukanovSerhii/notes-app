import type { TextSelection } from "@/app/lib/markdownActions";

export function readSelection(el: HTMLTextAreaElement): TextSelection {
  return {
    value: el.value,
    selectionStart: el.selectionStart,
    selectionEnd: el.selectionEnd,
  };
}

/**
 * Applies `next` to the textarea as a native edit, so the browser's own
 * undo/redo (Ctrl+Z) keeps working after toolbar actions. Setting `value`
 * through React state would wipe the undo history.
 *
 * Only the changed middle part is replaced, which keeps undo steps small.
 * Returns false when the browser refuses the native edit; the caller then
 * falls back to a plain state update.
 */
export function applyNativeEdit(
  el: HTMLTextAreaElement,
  next: TextSelection
): boolean {
  const prev = el.value;
  let start = 0;
  while (start < prev.length && start < next.value.length && prev[start] === next.value[start]) {
    start++;
  }
  let endPrev = prev.length;
  let endNext = next.value.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next.value[endNext - 1]) {
    endPrev--;
    endNext--;
  }

  el.focus();
  el.setSelectionRange(start, endPrev);
  const inserted = next.value.slice(start, endNext);
  const ok =
    inserted.length > 0
      ? document.execCommand("insertText", false, inserted)
      : start === endPrev || document.execCommand("delete");

  if (ok && el.value === next.value) {
    el.setSelectionRange(next.selectionStart, next.selectionEnd);
    return true;
  }
  return false;
}
