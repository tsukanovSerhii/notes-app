// Markdown insertion helpers shared by the toolbar and keyboard shortcuts.
// They operate on a <textarea> and return the new value + caret position so
// the caller can update React state and restore the selection.

export interface EditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

// Wrap the current selection with `before`/`after` (e.g. ** ** for bold).
// If nothing is selected, insert the markers and place the caret between them,
// optionally seeded with `placeholder` text.
export function wrapSelection(
  el: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder = ""
): EditResult {
  const { value, selectionStart, selectionEnd } = el;
  const selected = value.slice(selectionStart, selectionEnd) || placeholder;
  const next =
    value.slice(0, selectionStart) +
    before +
    selected +
    after +
    value.slice(selectionEnd);

  return {
    value: next,
    selectionStart: selectionStart + before.length,
    selectionEnd: selectionStart + before.length + selected.length,
  };
}

// Prefix each selected line with `prefix` (e.g. "# ", "- ", "> ").
// Ordered lists get incrementing numbers.
export function prefixLines(
  el: HTMLTextAreaElement,
  prefix: string,
  ordered = false
): EditResult {
  const { value, selectionStart, selectionEnd } = el;

  // Expand selection to whole lines.
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  let lineEnd = value.indexOf("\n", selectionEnd);
  if (lineEnd === -1) lineEnd = value.length;

  const block = value.slice(lineStart, lineEnd) || "";
  const lines = block.split("\n");
  const transformed = lines
    .map((line, i) => (ordered ? `${i + 1}. ${line}` : `${prefix}${line}`))
    .join("\n");

  const next = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
  return {
    value: next,
    selectionStart: lineStart,
    selectionEnd: lineStart + transformed.length,
  };
}

// Insert a raw block of text at the caret (e.g. a table or code fence),
// replacing any current selection.
export function insertBlock(
  el: HTMLTextAreaElement,
  text: string
): EditResult {
  const { value, selectionStart, selectionEnd } = el;
  const next =
    value.slice(0, selectionStart) + text + value.slice(selectionEnd);
  return {
    value: next,
    selectionStart: selectionStart + text.length,
    selectionEnd: selectionStart + text.length,
  };
}
