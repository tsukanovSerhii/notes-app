import type { TextSelection } from "@/features/editor/lib/markdownActions";

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

/**
 * Puts the caret at `offset` and scrolls the textarea so that line is near
 * the top. The position is measured on a hidden copy of the text, because
 * wrapped lines make "line number × line height" wrong.
 */
export function revealOffset(el: HTMLTextAreaElement, offset: number): void {
  el.focus();
  el.setSelectionRange(offset, offset);
  const style = getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const prop of [
    "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
    "paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth", "tabSize",
  ] as const) {
    mirror.style[prop] = style[prop];
  }
  mirror.style.cssText += ";position:absolute;visibility:hidden;top:0;left:-9999px;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box";
  mirror.style.width = `${el.clientWidth}px`;
  mirror.textContent = el.value.slice(0, offset) || "\u200b";
  document.body.appendChild(mirror);
  const top = mirror.scrollHeight - parseFloat(style.lineHeight || "0");
  mirror.remove();
  el.scrollTop = Math.max(0, top);
}
